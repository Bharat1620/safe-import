from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.models import Import, Job
from app.schemas import CommitOut, ImportOut, UploadOut
from app.services.importer import commit_import, parse_csv, run_job, stage_rows
from app.services.mapping import guess_mapping

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("", response_model=UploadOut)
def upload(
    file: UploadFile = File(...),
    idempotency_key: str | None = Form(None),
    session: Session = Depends(get_session),
):
    """
    Creates the import and stages its rows.

    Small files are staged during this request — routing a one-second task
    through a job, a queue and a poll loop would only make it slower. Larger
    ones get a job row and are staged in batches by the worker.
    """
    if idempotency_key:
        # A retried upload finds the original instead of creating a second one.
        existing = session.scalar(
            select(Import).where(Import.idempotency_key == idempotency_key)
        )
        if existing:
            job = session.scalar(
                select(Job).where(Job.import_id == existing.id)
            )
            return UploadOut(
                import_id=existing.id,
                total_rows=existing.total_rows,
                job_id=job.id if job else None,
            )

    raw = file.file.read()
    headers, rows = parse_csv(raw)
    if not headers:
        raise HTTPException(400, "Could not read any columns from that file")

    imp = Import(
        filename=file.filename or "upload.csv",
        status="mapping",
        total_rows=len(rows),
        idempotency_key=idempotency_key,
        headers=headers,
        # Heuristic first pass; the user confirms or overrides it.
        mapping=guess_mapping(headers),
    )
    session.add(imp)
    session.flush()  # assigns imp.id without ending the transaction

    if len(rows) <= settings.inline_row_limit:
        stage_rows(session, imp.id, rows, imp.mapping or {})
        imp.status = "review"
        session.commit()
        return UploadOut(import_id=imp.id, total_rows=len(rows))

    imp.raw_csv = raw
    job = Job(import_id=imp.id, total_rows=len(rows))
    session.add(job)
    # The import and its job are created together, so a crash cannot leave an
    # import with no job to process it.
    session.commit()

    return UploadOut(import_id=imp.id, total_rows=len(rows), job_id=job.id)


@router.get("/{import_id}", response_model=ImportOut)
def get_import(import_id: int, session: Session = Depends(get_session)):
    imp = session.get(Import, import_id)
    if imp is None:
        raise HTTPException(404, "Import not found")
    return imp


@router.post("/{import_id}/process")
def process(import_id: int, session: Session = Depends(get_session)):
    """
    Triggers staging for a queued import. Locally the worker loop calls this;
    deployed, the task queue does. Safe to call twice — it resumes rather than
    duplicating.
    """
    job = session.scalar(select(Job).where(Job.import_id == import_id))
    if job is None:
        raise HTTPException(404, "No job for that import")
    run_job(session, job.id)
    return {"status": job.status}


@router.post("/{import_id}/commit", response_model=CommitOut)
def commit(
    import_id: int,
    partial: bool = True,
    session: Session = Depends(get_session),
):
    """
    Moves staged rows into contacts in one transaction.

    partial=True imports the valid rows and returns the rest as rejects.
    partial=False rolls everything back if any row is rejected.
    """
    imp = session.get(Import, import_id)
    if imp is None:
        raise HTTPException(404, "Import not found")

    committed, rejects = commit_import(session, import_id, partial)

    if rejects and not partial:
        session.rollback()
        return CommitOut(committed=0, rejected=len(rejects), rejects=rejects)

    imp.status = "committed"
    session.commit()
    return CommitOut(
        committed=committed, rejected=len(rejects), rejects=rejects
    )
