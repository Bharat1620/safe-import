FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Spaces run containers as a non-root user, so anything the app touches has to
# be writable by it.
RUN useradd -m -u 1000 app
WORKDIR /app

# Dependencies first, so this layer is cached and only rebuilds when the
# lockfile changes rather than on every code edit.
COPY --chown=app:app pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY --chown=app:app . .

USER app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

# 7860 is what Hugging Face Spaces expects; Render and Cloud Run pass their own.
ENV PORT=7860
EXPOSE 7860

# Migrations run at startup so a schema change ships with the code that needs it.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
