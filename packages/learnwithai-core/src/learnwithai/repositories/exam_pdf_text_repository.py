"""Persistence helpers for extracted exam PDF text."""

from sqlmodel import select

from ..tables.exam_pdf_text import ExamPdfText
from .base_repository import BaseRepository


class ExamPdfTextRepository(BaseRepository[ExamPdfText, int]):
    """Provides persistence for extracted text associated with an exam PDF upload."""

    @property
    def model_type(self) -> type[ExamPdfText]:
        """Returns the SQLModel class managed by this repository."""
        return ExamPdfText

    def get_by_upload_id(self, upload_id: int) -> ExamPdfText | None:
        """Returns extracted text associated with a specific exam upload.

        Args:
            upload_id: Identifier of the exam PDF upload record.

        Returns:
            Matching extracted text record when found; otherwise ``None``.
        """
        stmt = select(ExamPdfText).where(ExamPdfText.upload_id == upload_id)
        return self._session.exec(stmt).first()
