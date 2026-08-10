from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Reads from environment variables, falling back to a local .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/safe_import"
    cors_origins: str = "http://localhost:5173"

    # Rows above this go to a background job instead of being processed inline.
    inline_row_limit: int = 20_000


settings = Settings()
