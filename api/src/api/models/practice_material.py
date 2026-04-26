"""Pydantic models for practice material generation API responses."""

from datetime import datetime

from learnwithai.models.practice_material import PracticeMaterialSet
from learnwithai.tables.async_job import AsyncJobStatus
from pydantic import BaseModel


class PracticeMaterialGenerateResponse(BaseModel):
    """Response returned when practice material generation is queued."""

    job_id: int
    status: AsyncJobStatus


class PracticeMaterialResponse(PracticeMaterialSet):
    """Response containing generated practice materials for an exam upload."""

    id: int
    student_pid: int
    course_id: int
    generated_at: datetime
