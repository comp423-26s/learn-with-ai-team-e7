"""Persistence helpers for uploaded exam PDF metadata."""

from ..tables.exam_pdf_upload import ExamPdfUpload
from .base_repository import BaseRepository


class ExamPdfUploadRepository(BaseRepository[ExamPdfUpload, int]):
    """Provides metadata persistence for uploaded exam PDFs."""

    @property
    def model_type(self) -> type[ExamPdfUpload]:
        """Returns the SQLModel class managed by this repository."""
        return ExamPdfUpload
