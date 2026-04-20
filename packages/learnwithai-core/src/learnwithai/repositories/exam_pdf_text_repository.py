"""Persistence helpers for extracted exam PDF text."""

from ..tables.exam_pdf_text import ExamPdfText
from .base_repository import BaseRepository


class ExamPdfTextRepository(BaseRepository[ExamPdfText, int]):
    """Provides persistence for extracted text associated with an exam PDF upload."""

    @property
    def model_type(self) -> type[ExamPdfText]:
        return ExamPdfText
