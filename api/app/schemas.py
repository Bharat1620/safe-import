from datetime import datetime

from pydantic import BaseModel


class ImportOut(BaseModel):
    id: int
    filename: str
    status: str
    total_rows: int
    created_at: datetime
    headers: list[str] | None = None
    mapping: dict[str, str] | None = None
    mapping_confidence: dict[str, float] | None = None

    model_config = {"from_attributes": True}


class MappingIn(BaseModel):
    """{csv column -> canonical field}. Columns left out are ignored."""

    mapping: dict[str, str]


class RowOut(BaseModel):
    """Matches the frontend's Row type, so the grid needs no translation."""

    index: int
    cells: dict[str, str]
    errors: dict[str, str] | None = None


class RowsPage(BaseModel):
    rows: list[RowOut]


class CountOut(BaseModel):
    count: int


class CellDiffIn(BaseModel):
    rowIndex: int
    columnKey: str
    before: str
    after: str


class ApplyEditsIn(BaseModel):
    diffs: list[CellDiffIn]


class JobOut(BaseModel):
    id: int
    import_id: int
    status: str
    processed_rows: int
    total_rows: int
    error: str | None

    model_config = {"from_attributes": True}


class UploadOut(BaseModel):
    import_id: int
    total_rows: int
    # Set when the file was large enough to be processed in the background.
    job_id: int | None = None


class CommitOut(BaseModel):
    committed: int
    rejected: int
    rejects: list[dict]
