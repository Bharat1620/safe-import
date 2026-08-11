from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Reads from environment variables, falling back to a local .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/safe_import"
    cors_origins: str = "http://localhost:5173"

    # Rows above this go to a background job instead of being processed inline.
    inline_row_limit: int = 20_000

    # Unset means column mapping stays on the heuristic path.
    gemini_api_key: str = ""
    # An alias rather than a pinned version: Google retires specific models and
    # closes older ones to new projects, which breaks fresh API keys.
    gemini_model: str = "gemini-flash-latest"


settings = Settings()
