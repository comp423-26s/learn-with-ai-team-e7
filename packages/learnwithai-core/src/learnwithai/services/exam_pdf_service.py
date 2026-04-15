"""Business logic for validating authorization and storing exam PDFs."""

from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4

from ..errors import AuthorizationError
from ..interfaces import ObjectStorage
from ..repositories.exam_pdf_upload_repository import ExamPdfUploadRepository
from ..repositories.membership_repository import MembershipRepository
from ..tables.course import Course
from ..tables.exam_pdf_upload import ExamPdfUpload
from ..tables.membership import MembershipState
from ..tables.user import User

logger = logging.getLogger(__name__)


class ExamPdfService:
    """Stores exam PDFs and records their metadata."""

    def __init__(
        self,
        exam_pdf_upload_repo: ExamPdfUploadRepository,
        membership_repo: MembershipRepository,
        object_storage: ObjectStorage,
    ) -> None:
        """Initializes service dependencies."""
        self._exam_pdf_upload_repo = exam_pdf_upload_repo
        self._membership_repo = membership_repo
        self._object_storage = object_storage

    def upload_pdf(
        self,
        subject: User,
        course: Course,
        original_filename: str,
        pdf_bytes: bytes,
    ) -> ExamPdfUpload:
        """Uploads a PDF for a course and persists upload metadata.

        Args:
            subject: Authenticated user uploading the PDF.
            course: Target course for the upload.
            original_filename: Filename reported by the uploader.
            pdf_bytes: Raw PDF bytes.

        Returns:
            Persisted exam PDF upload record.

        Raises:
            AuthorizationError: If the user is not enrolled in the course.
            RuntimeError: If object storage upload fails.
        """
        membership = self._membership_repo.get_by_user_and_course(subject, course)
        if membership is None or membership.state != MembershipState.ENROLLED:
            raise AuthorizationError("Not enrolled in this course")

        if course.id is None:
            raise ValueError("Course must be persisted before uploading PDFs")

        filename = self._sanitize_filename(original_filename)
        storage_key = f"courses/{course.id}/exam-pdfs/{subject.pid}/{uuid4().hex}.pdf"

        try:
            self._object_storage.upload_pdf(storage_key, pdf_bytes)
        except Exception as exc:  # pragma: no cover - exact backend errors vary
            logger.exception(
                "Failed to upload exam PDF to object storage",
                extra={"course_id": course.id, "uploader_pid": subject.pid},
            )
            raise RuntimeError("Failed to store PDF") from exc

        return self._exam_pdf_upload_repo.create(
            ExamPdfUpload(
                course_id=course.id,
                uploader_pid=subject.pid,
                storage_key=storage_key,
                original_filename=filename,
                content_type="application/pdf",
                size_bytes=len(pdf_bytes),
            )
        )

    def _sanitize_filename(self, filename: str) -> str:
        """Strips path segments and provides a safe fallback name."""
        cleaned = Path(filename).name.strip()
        return cleaned or "upload.pdf"
