from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Job
from app.schemas import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, session: Session = Depends(get_session)):
    """
    What the progress bar polls. State lives in the row, not in a connection,
    so closing the tab and reopening it resumes the display exactly.
    """
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job
