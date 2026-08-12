import csv
import io

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.models import Contact, Import, Job, StagedRow
from app.services.validation import (
    CANONICAL_FIELDS,
    normalize_email,
    normalize_phone,
    validate_row,
)

BATCH_SIZE = 5_000


def parse_csv(raw: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """
    utf-8-sig strips the byte-order mark Excel writes, which would otherwise
    turn the first header into "﻿full_name" and break every mapping.
    """
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = [
        {k: (v or "").strip() for k, v in row.items() if k}
        for row in reader
        # Skip rows that are entirely blank — trailing newlines produce them.
        if any((v or "").strip() for v in row.values())
    ]
    return list(headers), rows


def apply_mapping(
    raw_row: dict[str, str], mapping: dict[str, str]
) -> dict[str, str]:
    """mapping is {csv column -> canonical field}. Unmapped columns are dropped."""
    cells = {field: "" for field in CANONICAL_FIELDS}
    for source, field in mapping.items():
        if field in cells:
            cells[field] = raw_row.get(source, "")
    return cells


def stage_rows(
    session: Session,
    import_id: int,
    rows: list[dict[str, str]],
    mapping: dict[str, str],
    start_index: int = 0,
) -> int:
    """Validates and inserts one batch. Returns how many rows were written."""
    records = []
    for offset, raw_row in enumerate(rows):
        cells = apply_mapping(raw_row, mapping)
        if cells.get("phone"):
            cells["phone"] = normalize_phone(cells["phone"])
        errors = validate_row(cells)
        records.append(
            {
                "import_id": import_id,
                "row_index": start_index + offset,
                "data": cells,
                "errors": errors or None,
            }
        )

    if records:
        # execute() with a list uses insertmanyvalues, which sends a handful of
        # multi-row INSERTs. bulk_insert_mappings issues one statement per row,
        # which against a remote database is thousands of round trips.
        session.execute(insert(StagedRow.__table__), records)
    return len(records)


def commit_import(
    session: Session, import_id: int, partial: bool
) -> tuple[int, list[dict]]:
    """
    Moves staged rows into contacts inside a single transaction.

    Deduplication is enforced by the unique index on email_normalized, not by
    checking first: two concurrent commits would both read "no duplicate"
    before either wrote. Within one file, first occurrence wins and later ones
    are rejected rather than silently dropped.

    partial=False means any rejection rolls the whole thing back.
    """
    staged = session.scalars(
        select(StagedRow)
        .where(StagedRow.import_id == import_id)
        .order_by(StagedRow.row_index)
    ).all()

    existing = set(
        session.scalars(select(Contact.email_normalized)).all()
    )

    seen_in_file: set[str] = set()
    rejects: list[dict] = []
    to_insert: list[dict] = []

    for row in staged:
        cells = row.data or {}
        reason = None

        if row.errors:
            reason = "; ".join(f"{k}: {v}" for k, v in row.errors.items())
        else:
            key = normalize_email(cells.get("email", ""))
            if key in seen_in_file:
                reason = "Duplicate of an earlier row in this file"
            elif key in existing:
                reason = "Already exists"
            else:
                seen_in_file.add(key)
                to_insert.append(
                    {
                        "full_name": cells.get("full_name", ""),
                        "email": cells.get("email", ""),
                        "email_normalized": key,
                        "phone": cells.get("phone") or None,
                        "company": cells.get("company") or None,
                    }
                )

        if reason:
            rejects.append({"row": row.row_index + 1, "reason": reason, **cells})

    if rejects and not partial:
        # Nothing was flushed yet, so returning without inserting leaves the
        # database untouched. The caller rolls back.
        return 0, rejects

    if to_insert:
        session.execute(insert(Contact.__table__), to_insert)

    return len(to_insert), rejects


def run_job(session: Session, job_id: int) -> None:
    """
    Stages an import's rows in batches, committing progress after each one.

    Batching is not only about memory: a crash at row 400,000 leaves the job row
    saying exactly how far it got, so work resumes instead of restarting. That
    is also why it is safe to call this twice — it skips what is already staged.
    """
    job = session.get(Job, job_id)
    if job is None or job.status in ("done", "running"):
        return

    imp = session.get(Import, job.import_id)
    if imp is None or imp.raw_csv is None:
        job.status = "failed"
        job.error = "Import or uploaded file is missing"
        session.commit()
        return

    job.status = "running"
    session.commit()

    try:
        _, rows = parse_csv(imp.raw_csv)
        mapping = imp.mapping or {}

        # Resume from wherever a previous attempt stopped.
        start = count_rows(session, imp.id)

        while start < len(rows):
            batch = rows[start : start + BATCH_SIZE]
            stage_rows(session, imp.id, batch, mapping, start_index=start)
            start += len(batch)

            job.processed_rows = start
            session.commit()

        imp.status = "review"
        imp.total_rows = len(rows)
        job.status = "done"
        session.commit()

    except Exception as exc:
        session.rollback()
        job.status = "failed"
        job.error = str(exc)[:500]
        session.commit()


def count_rows(session: Session, import_id: int) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(StagedRow)
            .where(StagedRow.import_id == import_id)
        )
        or 0
    )


def clear_staged(session: Session, import_id: int) -> None:
    session.execute(delete(StagedRow).where(StagedRow.import_id == import_id))
