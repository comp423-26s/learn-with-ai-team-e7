"""Pydantic models for exam PDF upload API responses."""

from datetime import datetime

from learnwithai.models.exam_analysis import ExamAnalysisSummary
from pydantic import BaseModel

from .async_job import AsyncJobInfo

__all__ = [
    "AsyncJobInfo",
    "ExamAnalysisSummary",
    "ExamPdfAnalysisResponse",
    "ExamPdfHistoryItem",
    "ExamPdfUploadResponse",
]


class ExamPdfUploadResponse(BaseModel):
    """Response returned when a PDF upload is stored successfully.

    Includes async job information so the client can poll for analysis completion.
    """

    id: int
    course_id: int
    uploader_pid: int
    storage_key: str
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime
    job: AsyncJobInfo | None = None


class ExamPdfAnalysisResponse(BaseModel):
    """Response containing analysis results for an uploaded exam PDF."""

    upload_id: int
    analysis_data: ExamAnalysisSummary
    created_at: datetime


class ExamPdfHistoryItem(BaseModel):
    """Response item for exam PDF history list."""

    id: int
    original_filename: str
    uploaded_at: datetime
    has_analysis: bool
    has_practice: bool
