from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import imports, jobs, rows

app = FastAPI(title="Safe Import API")

# The browser blocks cross-origin requests unless the server opts in, and the
# frontend is on a different domain (Vercel) from the API (Cloud Run).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(imports.router)
app.include_router(rows.router)
app.include_router(jobs.router)


@app.get("/health")
def health():
    return {"status": "ok"}
