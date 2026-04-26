"""Persistence helpers for uploaded exam PDF metadata."""

from sqlmodel import select

from ..tables.exam_pdf_upload import ExamPdfUpload
from .base_repository import BaseRepository


class ExamPdfUploadRepository(BaseRepository[ExamPdfUpload, int]):
    """Provides metadata persistence for uploaded exam PDFs."""

    @property
    def model_type(self) -> type[ExamPdfUpload]:
        """Returns the SQLModel class managed by this repository."""
        return ExamPdfUpload

    def list_by_student_and_course(self, student_pid: int, course_id: int) -> list[ExamPdfUpload]:
        """Returns all exam PDF uploads by a student in a course, newest first.

        Args:
            student_pid: PID of the student.
            course_id: Identifier of the course.

        Returns:
            List of exam PDF uploads ordered by most recently created first.
        """
        stmt = (
            select(ExamPdfUpload)
            .where(ExamPdfUpload.uploader_pid == student_pid)
            .where(ExamPdfUpload.course_id == course_id)
            .order_by(ExamPdfUpload.created_at.desc())  # type: ignore[arg-type]
        )
        return list(self._session.exec(stmt).all())
