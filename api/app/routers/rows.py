from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Text, and_, cast, func, select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import StagedRow
from app.schemas import ApplyEditsIn, CountOut, RowOut, RowsPage
from app.services.validation import normalize_phone, validate_row

router = APIRouter(prefix="/imports/{import_id}", tags=["rows"])


def _has_errors():
    """
    Rows written before `none_as_null` hold the JSON value `null` rather than
    SQL NULL, so both have to be excluded.
    """
    return and_(
        StagedRow.errors.is_not(None),
        cast(StagedRow.errors, Text) != "null",
    )


@router.get("/rows/count", response_model=CountOut)
def count(
    import_id: int,
    errors_only: bool = False,
    session: Session = Depends(get_session),
):
    """The grid needs this before anything else — it sizes the scrollbar."""
    if errors_only:
        return CountOut(
            count=session.scalar(
                select(func.count())
                .select_from(StagedRow)
                .where(
                    StagedRow.import_id == import_id,
                    _has_errors(),
                )
            )
            or 0
        )

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
    errors_only: bool = False,
    session: Session = Depends(get_session),
):
    """
    One window of rows.

    Unfiltered, this ranges over row_index rather than using SQL OFFSET: OFFSET
    45000 makes Postgres walk and discard 45,000 rows, while an indexed range on
    (import_id, row_index) jumps straight there.

    Filtering to errors breaks that, since matching rows are scattered, so it
    falls back to OFFSET. Fine here — the filtered set is small by definition.
    """
    limit = min(max(limit, 1), 1000)

    if errors_only:
        rows = session.scalars(
            select(StagedRow)
            .where(
                StagedRow.import_id == import_id,
                _has_errors(),
            )
            .order_by(StagedRow.row_index)
            .offset(offset)
            .limit(limit)
        ).all()
        # Filtered rows are not contiguous, but the grid positions rows at
        # index * ROW_HEIGHT. So index becomes the position within the filtered
        # set, and row_number carries the real position in the file.
        return RowsPage(
            rows=[
                RowOut(
                    index=offset + i,
                    row_number=r.row_index + 1,
                    cells=r.data or {},
                    errors=r.errors,
                )
                for i, r in enumerate(rows)
            ]
        )

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
            RowOut(
                index=r.row_index,
                row_number=r.row_index + 1,
                cells=r.data or {},
                errors=r.errors,
            )
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
