from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# The engine owns a pool of database connections. Opening a connection takes
# ~50ms, so they are created once and reused across requests rather than opened
# per query. pool_pre_ping checks a connection is alive before handing it out,
# which matters against Neon: it suspends idle compute and drops connections.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Every model inherits this; it collects the table definitions."""


def get_session() -> Iterator[Session]:
    """One session per request, always closed. FastAPI injects this."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
