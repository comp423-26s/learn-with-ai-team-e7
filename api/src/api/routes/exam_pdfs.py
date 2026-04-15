"""Exam PDF upload routes for the public API."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, UploadFile
from learnwithai.services.exam_pdf_service import ExamPdfService

from ..di import AuthenticatedUserDI, CourseByCourseIDPathDI, ExamPdfServiceDI
from ..models import ExamPdfUploadResponse

MAX_PDF_BYTES = 50 * 1024 * 1024
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses/{course_id}/exam-pdfs", tags=["Exam PDFs"])


@router.post(
    "",
    response_model=ExamPdfUploadResponse,
    status_code=201,
    summary="Upload an exam PDF",
    response_description="The stored upload metadata and storage key.",
    responses={
        400: {"description": "Invalid file."},
        401: {"description": "Not authenticated."},
        403: {"description": "Insufficient permissions."},
        404: {"description": "Course not found."},
        500: {"description": "Storage failure."},
    },
)
async def upload_exam_pdf(
    subject: AuthenticatedUserDI,
    course: CourseByCourseIDPathDI,
    exam_pdf_svc: ExamPdfServiceDI,
    file: UploadFile,
) -> ExamPdfUploadResponse:
    """Validates and stores an uploaded exam PDF.

    Args:
        subject: Authenticated user uploading the file.
        course: Course loaded via path dependency.
        exam_pdf_svc: Service handling authorization and persistence.
        file: Uploaded PDF from multipart form-data.

    Returns:
        Stored upload metadata including storage key.

    Raises:
        HTTPException: If validation fails or storage encounters an error.
    """
    _validate_content_type(file, subject.pid, course.id)
    _validate_filename(file.filename, subject.pid, course.id)

    pdf_bytes = await file.read()
    _validate_file_size(pdf_bytes, subject.pid, course.id)
    _validate_pdf_signature(pdf_bytes, subject.pid, course.id)

    upload = _store_pdf(exam_pdf_svc, subject, course, file.filename or "upload.pdf", pdf_bytes)
    assert upload.id is not None
    return ExamPdfUploadResponse(
        id=upload.id,
        course_id=upload.course_id,
        uploader_pid=upload.uploader_pid,
        storage_key=upload.storage_key,
        original_filename=upload.original_filename,
        content_type=upload.content_type,
        size_bytes=upload.size_bytes,
        created_at=upload.created_at,
    )


def _validate_content_type(file: UploadFile, uploader_pid: int, course_id: int | None) -> None:
    """Verifies the uploaded file has a PDF content type."""
    if file.content_type == "application/pdf":
        return
    logger.warning(
        "Rejected exam PDF upload due to invalid content type",
        extra={"content_type": file.content_type, "uploader_pid": uploader_pid, "course_id": course_id},
    )
    raise HTTPException(status_code=400, detail="File must be a PDF.")


def _validate_filename(filename: str | None, uploader_pid: int, course_id: int | None) -> None:
    """Verifies the uploaded file has a .pdf extension."""
    if filename and filename.lower().endswith(".pdf"):
        return
    logger.warning(
        "Rejected exam PDF upload due to missing .pdf extension",
        extra={"filename": filename, "uploader_pid": uploader_pid, "course_id": course_id},
    )
    raise HTTPException(status_code=400, detail="Filename must end with .pdf.")


def _validate_file_size(pdf_bytes: bytes, uploader_pid: int, course_id: int | None) -> None:
    """Verifies the uploaded file does not exceed the max allowed size."""
    if len(pdf_bytes) <= MAX_PDF_BYTES:
        return
    logger.warning(
        "Rejected exam PDF upload due to file size limit",
        extra={"size_bytes": len(pdf_bytes), "uploader_pid": uploader_pid, "course_id": course_id},
    )
    raise HTTPException(status_code=400, detail="PDF file exceeds the 50 MB limit.")


def _validate_pdf_signature(pdf_bytes: bytes, uploader_pid: int, course_id: int | None) -> None:
    """Verifies file bytes include a valid PDF header signature."""
    if pdf_bytes.startswith(b"%PDF"):
        return
    logger.warning(
        "Rejected exam PDF upload due to invalid PDF header",
        extra={"uploader_pid": uploader_pid, "course_id": course_id},
    )
    raise HTTPException(status_code=400, detail="File content is not a valid PDF.")


def _store_pdf(
    exam_pdf_svc: ExamPdfService,
    subject: AuthenticatedUserDI,
    course: CourseByCourseIDPathDI,
    filename: str,
    pdf_bytes: bytes,
):
    """Stores the PDF and translates storage errors to HTTP responses."""
    try:
        return exam_pdf_svc.upload_pdf(subject, course, filename, pdf_bytes)
    except RuntimeError as exc:
        logger.exception(
            "Exam PDF storage failed",
            extra={"uploader_pid": subject.pid, "course_id": course.id},
        )
        raise HTTPException(status_code=500, detail="Failed to store PDF.") from exc
