import pathlib

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.models import Import, Job
from app.schemas import CommitOut, ImportOut, MappingIn, UploadOut
from app.services.importer import (
    clear_staged,
    commit_import,
    parse_csv,
    run_job,
    stage_rows,
)
from app.services.llm_mapping import suggest_mapping

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

    return _create_import(
        session, file.file.read(), file.filename or "upload.csv", idempotency_key
    )


def _create_import(
    session: Session,
    raw: bytes,
    filename: str,
    idempotency_key: str | None,
) -> UploadOut:
    headers, rows = parse_csv(raw)
    if not headers:
        raise HTTPException(400, "Could not read any columns from that file")

    # One call per file. Falls back to the heuristic mapper if the model is
    # unavailable, so a mapping failure never blocks an import.
    suggestions = suggest_mapping(headers, rows)

    imp = Import(
        filename=filename,
        status="mapping",
        total_rows=len(rows),
        idempotency_key=idempotency_key,
        headers=headers,
        mapping={s["column"]: s["field"] for s in suggestions if s["field"]},
        mapping_confidence={s["column"]: s["confidence"] for s in suggestions},
        # Kept until commit so the file can be re-staged under a new mapping.
        raw_csv=raw,
    )
    session.add(imp)
    session.flush()  # assigns imp.id without ending the transaction

    if len(rows) <= settings.inline_row_limit:
        stage_rows(session, imp.id, rows, imp.mapping or {})
        imp.status = "review"
        session.commit()
        return UploadOut(import_id=imp.id, total_rows=len(rows))

    job = Job(import_id=imp.id, total_rows=len(rows))
    session.add(job)
    # The import and its job are created together, so a crash cannot leave an
    # import with no job to process it.
    session.commit()

    return UploadOut(import_id=imp.id, total_rows=len(rows), job_id=job.id)


@router.post("/sample", response_model=UploadOut)
def upload_sample(session: Session = Depends(get_session)):
    """
    Starts an import from a bundled file, so someone with no CSV to hand can
    still see the whole flow. Its headers are deliberately opaque — the
    heuristic mapper cannot resolve them and the model can.
    """
    # __file__ is app/routers/imports.py, so the app package is two levels up.
    raw = (pathlib.Path(__file__).parents[1] / "sample.csv").read_bytes()
    return _create_import(session, raw, "sample.csv", None)


@router.get("/{import_id}", response_model=ImportOut)
def get_import(import_id: int, session: Session = Depends(get_session)):
    imp = session.get(Import, import_id)
    if imp is None:
        raise HTTPException(404, "Import not found")
    return imp


@router.put("/{import_id}/mapping", response_model=ImportOut)
def set_mapping(
    import_id: int,
    payload: MappingIn,
    session: Session = Depends(get_session),
):
    """
    Re-stages the file under a new {csv column -> field} mapping.

    Staged rows are derived data, so the honest way to change the mapping is to
    rebuild them. Edits made before remapping are discarded, which is why the UI
    asks for confirmation once any editing has happened.
    """
    imp = session.get(Import, import_id)
    if imp is None:
        raise HTTPException(404, "Import not found")
    if imp.status == "committed":
        raise HTTPException(409, "This import has already been committed")
    if imp.raw_csv is None:
        raise HTTPException(409, "The uploaded file is no longer available")

    _, rows = parse_csv(imp.raw_csv)
    imp.mapping = payload.mapping
    clear_staged(session, import_id)
    stage_rows(session, import_id, rows, payload.mapping)
    imp.total_rows = len(rows)
    imp.status = "review"
    session.commit()
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
    # Remapping is no longer possible, so the uploaded blob is dead weight.
    imp.raw_csv = None
    session.commit()
    return CommitOut(
        committed=committed, rejected=len(rejects), rejects=rejects
    )
