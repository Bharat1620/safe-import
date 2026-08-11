from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Import(Base):
    """One uploaded file. Rows live in staged_rows until the user commits."""

    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="mapping")
    total_rows: Mapped[int] = mapped_column(Integer, default=0)

    # Set by the client per upload attempt. The unique index below means a
    # retried upload hits a constraint violation instead of creating a second
    # import — the request is idempotent even though it is not read-only.
    idempotency_key: Mapped[str | None] = mapped_column(String(64), unique=True)

    # {csv column -> canonical field}, confirmed by the user before staging.
    mapping: Mapped[dict | None] = mapped_column(JSON)
    headers: Mapped[list | None] = mapped_column(JSON)

    # {csv column -> 0..1}. Drives review order, not just display.
    mapping_confidence: Mapped[dict | None] = mapped_column(JSON)

    # Kept so a background job can stage the rows after the request returns.
    # Fine at demo sizes; a real deployment would put this in object storage.
    raw_csv: Mapped[bytes | None] = mapped_column(LargeBinary)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    rows: Mapped[list["StagedRow"]] = relationship(
        back_populates="import_", cascade="all, delete-orphan"
    )


class StagedRow(Base):
    """
    A parsed CSV row, not yet committed. Columns are stored as JSON rather than
    real columns because the incoming shape is unknown until mapping is done.
    """

    __tablename__ = "staged_rows"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_id: Mapped[int] = mapped_column(
        ForeignKey("imports.id", ondelete="CASCADE")
    )

    # Position in the file. This is what the grid pages on, so it is indexed.
    row_index: Mapped[int] = mapped_column(Integer)

    data: Mapped[dict] = mapped_column(JSON)
    errors: Mapped[dict | None] = mapped_column(JSON)

    import_: Mapped[Import] = relationship(back_populates="rows")

    __table_args__ = (
        # The grid asks for "rows 400-599 of import 12" constantly. Without this
        # index Postgres scans every row of the import to find them.
        Index("ix_staged_rows_import_row", "import_id", "row_index", unique=True),
    )


class Contact(Base):
    """The canonical table. Only committed, validated data lands here."""

    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320))

    # Lowercased and trimmed at write time. The unique index is on this rather
    # than `email`, so "A@x.com" and "a@x.com " collide as they should.
    #
    # Enforcing it here rather than checking in Python is deliberate: two
    # concurrent commits would both read "no duplicate" before either writes.
    # Only the database can settle that, because only it serialises the writes.
    email_normalized: Mapped[str] = mapped_column(String(320), unique=True)

    phone: Mapped[str | None] = mapped_column(String(32))
    company: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Job(Base):
    """
    Background work for an import. The row is the state — a worker updates it,
    the client polls it, and both survive the API restarting or the tab closing.
    """

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_id: Mapped[int] = mapped_column(
        ForeignKey("imports.id", ondelete="CASCADE")
    )

    status: Mapped[str] = mapped_column(String(32), default="pending")
    processed_rows: Mapped[int] = mapped_column(Integer, default=0)
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
