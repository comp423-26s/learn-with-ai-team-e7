"""Tests for exam PDF upload route handlers."""

from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, UploadFile
from learnwithai.errors import AuthorizationError
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
from starlette.datastructures import Headers

from api.models import ExamPdfUploadResponse
from api.routes import exam_pdfs
from api.routes.exam_pdfs import upload_exam_pdf


def _stub_user(pid: int = 123456789) -> MagicMock:
    mock = MagicMock()
    mock.pid = pid
    return mock


def _stub_course(course_id: int = 1) -> MagicMock:
    mock = MagicMock()
    mock.id = course_id
    return mock


def _make_upload_file(
    content: bytes = b"%PDF-1.7\n%hello",
    content_type: str = "application/pdf",
    filename: str = "exam.pdf",
) -> UploadFile:
    return UploadFile(
        file=BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def _stub_upload_record(record_id: int = 22, course_id: int = 1, uploader_pid: int = 123456789) -> MagicMock:
    mock = MagicMock(spec=ExamPdfUpload)
    mock.id = record_id
    mock.course_id = course_id
    mock.uploader_pid = uploader_pid
    mock.storage_key = "courses/1/exam-pdfs/123/key.pdf"
    mock.original_filename = "exam.pdf"
    mock.content_type = "application/pdf"
    mock.size_bytes = 13
    mock.created_at = datetime(2026, 4, 15, tzinfo=timezone.utc)
    return mock


@pytest.mark.anyio
async def test_upload_exam_pdf_returns_success_response() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    exam_pdf_svc.upload_pdf.return_value = _stub_upload_record()
    file = _make_upload_file()

    result = await upload_exam_pdf(subject, course, exam_pdf_svc, file)

    assert isinstance(result, ExamPdfUploadResponse)
    assert result.id == 22
    assert result.storage_key == "courses/1/exam-pdfs/123/key.pdf"
    exam_pdf_svc.upload_pdf.assert_called_once()


@pytest.mark.anyio
async def test_upload_exam_pdf_rejects_non_pdf_content_type() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    file = _make_upload_file(content_type="text/plain")

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, file)

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_exam_pdf_rejects_missing_pdf_extension() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    file = _make_upload_file(filename="exam.txt")

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, file)

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_exam_pdf_rejects_invalid_signature() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    file = _make_upload_file(content=b"NOT_PDF")

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, file)

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_exam_pdf_rejects_oversized_file(monkeypatch: pytest.MonkeyPatch) -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    monkeypatch.setattr(exam_pdfs, "MAX_PDF_BYTES", 8)
    file = _make_upload_file(content=b"%PDF-123456789")

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, file)

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_exam_pdf_maps_storage_failure_to_500() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    exam_pdf_svc.upload_pdf.side_effect = RuntimeError("boom")
    file = _make_upload_file()

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, file)

    assert exc_info.value.status_code == 500


@pytest.mark.anyio
async def test_upload_exam_pdf_propagates_authorization_error() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    exam_pdf_svc.upload_pdf.side_effect = AuthorizationError("Not enrolled in this course")
    file = _make_upload_file()

    with pytest.raises(AuthorizationError):
        await upload_exam_pdf(subject, course, exam_pdf_svc, file)
