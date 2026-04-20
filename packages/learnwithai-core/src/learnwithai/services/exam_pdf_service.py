"""Business logic for validating authorization, storing, and extracting exam PDFs."""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

from ..errors import AuthorizationError
from ..interfaces import ObjectStorage

if TYPE_CHECKING:
    from ..repositories.exam_pdf_text_repository import ExamPdfTextRepository
from ..repositories.exam_pdf_upload_repository import ExamPdfUploadRepository
from ..repositories.membership_repository import MembershipRepository
from ..tables.course import Course
from ..tables.exam_pdf_upload import ExamPdfUpload
from ..tables.membership import MembershipState
from ..tables.user import User

logger = logging.getLogger(__name__)


class ExamPdfService:
    """Stores exam PDFs, records metadata, and extracts text for downstream analysis.

    Extraction is best-effort: typed PDFs use pdfminer.six when available. For
    primarily scanned PDFs an OCR pass is attempted if optional OCR dependencies are
    installed. Failures in extraction are logged but do not prevent the upload.
    """

    def __init__(
        self,
        exam_pdf_upload_repo: ExamPdfUploadRepository,
        membership_repo: MembershipRepository,
        object_storage: ObjectStorage,
        exam_pdf_text_repo: ExamPdfTextRepository,
    ) -> None:
        """Initializes service dependencies."""
        self._exam_pdf_upload_repo = exam_pdf_upload_repo
        self._membership_repo = membership_repo
        self._object_storage = object_storage
        self._exam_pdf_text_repo = exam_pdf_text_repo

    def upload_pdf(
        self,
        subject: User,
        course: Course,
        original_filename: str,
        pdf_bytes: bytes,
    ) -> ExamPdfUpload:
        """Uploads a PDF, persists metadata, and stores extracted text when possible.

        Extraction errors are handled gracefully: extraction is attempted but any
        failure is logged and does not surface to the caller.
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

        upload = self._exam_pdf_upload_repo.create(
            ExamPdfUpload(
                course_id=course.id,
                uploader_pid=subject.pid,
                storage_key=storage_key,
                original_filename=filename,
                content_type="application/pdf",
                size_bytes=len(pdf_bytes),
            )
        )

        # Best-effort text extraction for downstream analysis.
        try:
            extracted = self._extract_text_from_pdf(pdf_bytes)
            if extracted:
                try:
                    from ..tables.exam_pdf_text import ExamPdfText

                    self._exam_pdf_text_repo.create(ExamPdfText(upload_id=upload.id, extracted_text=extracted))
                    logger.info(
                        "Extracted text stored for exam PDF",
                        extra={
                            "upload_id": upload.id,
                            "course_id": course.id,
                            "uploader_pid": subject.pid,
                        },
                    )
                except Exception:
                    logger.exception(
                        "Failed to persist extracted text",
                        extra={
                            "upload_id": upload.id,
                            "course_id": course.id,
                            "uploader_pid": subject.pid,
                        },
                    )
        except Exception:
            logger.exception(
                "PDF text extraction failed",
                extra={
                    "upload_id": getattr(upload, "id", None),
                    "course_id": course.id,
                    "uploader_pid": subject.pid,
                },
            )

        return upload

    def _sanitize_filename(self, filename: str) -> str:
        """Strips path segments and provides a safe fallback name."""
        cleaned = Path(filename).name.strip()
        return cleaned or "upload.pdf"

    def _extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        """Attempt typed-text extraction and fallback to OCR if needed.

        Returns the extracted text or an empty string on failure.
        """
        # First, try typed text extraction with pdfminer.six if available.
        try:
            from pdfminer.high_level import extract_text

            text = extract_text(io.BytesIO(pdf_bytes)) or ""
        except Exception:  # ImportError or runtime extraction error
            logger.info("pdfminer.six not available or extraction failed; skipping typed extraction")
            text = ""

        # If typed extraction yields little text, attempt OCR when optional deps are present.
        if len(text.strip()) < 50:
            try:
                import pytesseract
                from pdf2image import convert_from_bytes

                images = convert_from_bytes(pdf_bytes)
                ocr_texts = [pytesseract.image_to_string(img) for img in images]
                ocr_combined = "\n".join(ocr_texts).strip()
                if ocr_combined:
                    text = (text + "\n" + ocr_combined).strip()
            except Exception:
                logger.info("OCR dependencies unavailable or OCR failed; skipping OCR fallback")

        return text or ""
