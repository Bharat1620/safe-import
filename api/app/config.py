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
    # Pinned rather than an alias: free-tier quota is per model per day, and
    # the "latest" alias points at whichever model is newest and most
    # restricted. A lite model is plenty for classifying column headers.
    gemini_model: str = "gemini-3.1-flash-lite"


settings = Settings()
