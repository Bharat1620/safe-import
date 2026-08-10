from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import StagedRow
from app.schemas import ApplyEditsIn, CountOut, RowOut, RowsPage
from app.services.validation import normalize_phone, validate_row

router = APIRouter(prefix="/imports/{import_id}", tags=["rows"])


@router.get("/rows/count", response_model=CountOut)
def count(import_id: int, session: Session = Depends(get_session)):
    """The grid needs this before anything else — it sizes the scrollbar."""
    total = session.scalar(
        select(StagedRow.row_index)
        .where(StagedRow.import_id == import_id)
        .order_by(StagedRow.row_index.desc())
        .limit(1)
    )
    return CountOut(count=(total + 1) if total is not None else 0)


@router.get("/rows", response_model=RowsPage)
def get_rows(
    import_id: int,
    offset: int = 0,
    limit: int = 200,
    session: Session = Depends(get_session),
):
    """
    One window of rows. Filtered on row_index rather than SQL OFFSET: OFFSET
    45000 makes Postgres walk and discard 45,000 rows, while an indexed range
    on (import_id, row_index) jumps straight there.
    """
    limit = min(max(limit, 1), 1000)

    rows = session.scalars(
        select(StagedRow)
        .where(
            StagedRow.import_id == import_id,
            StagedRow.row_index >= offset,
            StagedRow.row_index < offset + limit,
        )
        .order_by(StagedRow.row_index)
    ).all()

    return RowsPage(
        rows=[
            RowOut(index=r.row_index, cells=r.data or {}, errors=r.errors)
            for r in rows
        ]
    )


@router.patch("/rows")
def apply_edits(
    import_id: int,
    payload: ApplyEditsIn,
    session: Session = Depends(get_session),
):
    """
    Applies a batch of cell diffs. The whole batch is one transaction, so a
    10,000-cell paste either lands completely or not at all — which is what
    lets the client treat it as a single undoable command.
    """
    if not payload.diffs:
        return {"updated": 0}

    indices = {d.rowIndex for d in payload.diffs}
    rows = {
        r.row_index: r
        for r in session.scalars(
            select(StagedRow).where(
                StagedRow.import_id == import_id,
                StagedRow.row_index.in_(indices),
            )
        )
    }

    missing = indices - rows.keys()
    if missing:
        raise HTTPException(404, f"Rows not found: {sorted(missing)[:5]}")

    for diff in payload.diffs:
        row = rows[diff.rowIndex]
        # Reassigned rather than mutated: SQLAlchemy does not track changes
        # inside a JSON dict, so an in-place edit would never be written.
        data = dict(row.data or {})
        value = diff.after
        if diff.columnKey == "phone" and value:
            value = normalize_phone(value)
        data[diff.columnKey] = value
        row.data = data
        row.errors = validate_row(data) or None

    session.commit()
    return {"updated": len(payload.diffs)}
