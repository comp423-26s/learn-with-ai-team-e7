"""Tests for exam PDF upload route handlers."""

from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from learnwithai.errors import AuthorizationError
from learnwithai.models.exam_analysis import ExamAnalysisSummary, TopicSummaryLine
from starlette.datastructures import Headers

from api.di import exam_pdf_service_factory, get_authenticated_user, get_course_by_path_id
from api.main import app
from api.models import ExamPdfAnalysisResponse, ExamPdfHistoryItem, ExamPdfUploadResponse
from api.routes import exam_pdfs
from api.routes.exam_pdfs import get_exam_analysis, list_exam_pdf_uploads, upload_exam_pdf

_STUB_PERFORMANCE_ANALYSIS = {
    "topic_summaries": [
        {"topic": "Algebra", "question_ids": ["q1"], "average_score_pct": 0.9, "performance": "strong"},
        {"topic": "Geometry", "question_ids": ["q2"], "average_score_pct": 0.4, "performance": "weak"},
        {"topic": "Trigonometry", "question_ids": ["q3"], "average_score_pct": 0.7, "performance": "needs_review"},
    ],
    "question_mappings": [
        {"question_id": "q1", "topic": "Algebra", "performance": "strong", "score_earned": 9.0, "score_possible": 10.0},
        {"question_id": "q2", "topic": "Geometry", "performance": "weak", "score_earned": 4.0, "score_possible": 10.0},
        {
            "question_id": "q3",
            "topic": "Trigonometry",
            "performance": "needs_review",
            "score_earned": 7.0,
            "score_possible": 10.0,
        },
    ],
    "strengths": ["Algebra"],
    "weaknesses": ["Geometry"],
    "needs_review": ["Trigonometry"],
}

_STUB_SUMMARY = ExamAnalysisSummary(
    headline="You performed well in Algebra. Focus your revision on Geometry.",
    overall_score_pct=0.667,
    strengths=[
        TopicSummaryLine(label="Algebra (strong)", topic="Algebra", performance="strong", average_score_pct=0.9)
    ],
    weaknesses=[TopicSummaryLine(label="Geometry (weak)", topic="Geometry", performance="weak", average_score_pct=0.4)],
    needs_review=[
        TopicSummaryLine(
            label="Trigonometry (needs review)", topic="Trigonometry", performance="needs_review", average_score_pct=0.7
        )
    ],
)


def _stub_exam_analysis_svc() -> MagicMock:
    mock = MagicMock()
    mock.summarize_analysis.return_value = _STUB_SUMMARY
    return mock


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
    mock = MagicMock()
    mock.id = record_id
    mock.course_id = course_id
    mock.uploader_pid = uploader_pid
    mock.storage_key = "courses/1/exam-pdfs/123/key.pdf"
    mock.original_filename = "exam.pdf"
    mock.content_type = "application/pdf"
    mock.size_bytes = 13
    mock.created_at = datetime(2026, 4, 15, tzinfo=timezone.utc)
    mock.analysis_data = _STUB_PERFORMANCE_ANALYSIS
    return mock


def _stub_async_job(job_id: int, upload_id: int, status: str = "pending") -> MagicMock:
    mock = MagicMock()
    mock.id = job_id
    mock.status = status
    mock.completed_at = None
    mock.input_data = {"upload_id": upload_id}
    return mock


# ---------------------------------------------------------------------------
# upload_exam_pdf
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_upload_exam_pdf_returns_success_response() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    exam_pdf_svc.upload_pdf.return_value = _stub_upload_record()
    async_job_repo = MagicMock()
    async_job_repo.list_by_course_and_kind.return_value = []
    file = _make_upload_file()

    result = await upload_exam_pdf(subject, course, exam_pdf_svc, async_job_repo, file)

    assert isinstance(result, ExamPdfUploadResponse)
    assert result.id == 22
    assert result.storage_key == "courses/1/exam-pdfs/123/key.pdf"
    exam_pdf_svc.upload_pdf.assert_called_once()


@pytest.mark.anyio
async def test_upload_exam_pdf_populates_job_info_when_matching_async_job_exists() -> None:
    # Lines 89-95: the loop body executes and breaks with a matching job.
    upload = _stub_upload_record(record_id=22)
    exam_pdf_svc = MagicMock()
    exam_pdf_svc.upload_pdf.return_value = upload
    async_job_repo = MagicMock()
    async_job_repo.list_by_course_and_kind.return_value = [
        _stub_async_job(job_id=7, upload_id=999),  # non-matching job skipped
        _stub_async_job(job_id=8, upload_id=22, status="pending"),  # matching job
    ]

    result = await upload_exam_pdf(_stub_user(), _stub_course(), exam_pdf_svc, async_job_repo, _make_upload_file())

    assert result.job is not None
    assert result.job.id == 8
    assert result.job.status == "pending"
    assert result.job.completed_at is None


@pytest.mark.anyio
async def test_upload_exam_pdf_job_info_is_none_when_no_job_matches_upload_id() -> None:
    # Line 83→97: the loop exhausts without breaking because no job references this upload.
    upload = _stub_upload_record(record_id=22)
    exam_pdf_svc = MagicMock()
    exam_pdf_svc.upload_pdf.return_value = upload
    async_job_repo = MagicMock()
    async_job_repo.list_by_course_and_kind.return_value = [
        _stub_async_job(job_id=1, upload_id=999),
        _stub_async_job(job_id=2, upload_id=888),
    ]

    result = await upload_exam_pdf(_stub_user(), _stub_course(), exam_pdf_svc, async_job_repo, _make_upload_file())

    assert result.job is None


@pytest.mark.integration
def test_upload_exam_pdf_accepts_multipart_request(client: TestClient) -> None:
    from api.di import async_job_repository_factory

    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    exam_pdf_svc.upload_pdf.return_value = _stub_upload_record()
    async_job_repo = MagicMock()
    async_job_repo.list_by_course_and_kind.return_value = []

    app.dependency_overrides[get_authenticated_user] = lambda: subject
    app.dependency_overrides[get_course_by_path_id] = lambda: course
    app.dependency_overrides[exam_pdf_service_factory] = lambda: exam_pdf_svc
    app.dependency_overrides[async_job_repository_factory] = lambda: async_job_repo

    response = client.post(
        "/api/courses/1/exam-pdfs",
        files={"file": ("exam.pdf", b"%PDF-1.7\n%hello", "application/pdf")},
    )

    assert response.status_code == 202
    assert response.json()["id"] == 22
    exam_pdf_svc.upload_pdf.assert_called_once()


@pytest.mark.anyio
async def test_upload_exam_pdf_rejects_non_pdf_content_type() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    async_job_repo = MagicMock()
    file = _make_upload_file(content_type="text/plain")

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, async_job_repo, file)

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_exam_pdf_rejects_missing_pdf_extension() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    async_job_repo = MagicMock()
    file = _make_upload_file(filename="exam.txt")

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, async_job_repo, file)

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_exam_pdf_rejects_invalid_signature() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    async_job_repo = MagicMock()
    file = _make_upload_file(content=b"NOT_PDF")

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, async_job_repo, file)

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_exam_pdf_rejects_oversized_file(monkeypatch: pytest.MonkeyPatch) -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    async_job_repo = MagicMock()
    monkeypatch.setattr(exam_pdfs, "MAX_PDF_BYTES", 8)
    file = _make_upload_file(content=b"%PDF-123456789")

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, async_job_repo, file)

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_exam_pdf_maps_storage_failure_to_500() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    async_job_repo = MagicMock()
    exam_pdf_svc.upload_pdf.side_effect = RuntimeError("boom")
    file = _make_upload_file()

    with pytest.raises(HTTPException) as exc_info:
        await upload_exam_pdf(subject, course, exam_pdf_svc, async_job_repo, file)

    assert exc_info.value.status_code == 500


@pytest.mark.anyio
async def test_upload_exam_pdf_propagates_authorization_error() -> None:
    subject = _stub_user()
    course = _stub_course()
    exam_pdf_svc = MagicMock()
    async_job_repo = MagicMock()
    exam_pdf_svc.upload_pdf.side_effect = AuthorizationError("Not enrolled in this course")
    file = _make_upload_file()

    with pytest.raises(AuthorizationError):
        await upload_exam_pdf(subject, course, exam_pdf_svc, async_job_repo, file)


# ---------------------------------------------------------------------------
# get_exam_analysis
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_exam_analysis_returns_persisted_analysis() -> None:
    subject = _stub_user()
    course = _stub_course()
    upload_repo = MagicMock()
    membership_repo = MagicMock()
    exam_analysis_svc = _stub_exam_analysis_svc()
    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = _stub_upload_record()

    result = await get_exam_analysis(subject, course, 22, upload_repo, membership_repo, exam_analysis_svc)

    assert isinstance(result, ExamPdfAnalysisResponse)
    assert result.upload_id == 22
    assert isinstance(result.analysis_data, ExamAnalysisSummary)
    assert result.analysis_data.headline == "You performed well in Algebra. Focus your revision on Geometry."
    exam_analysis_svc.summarize_analysis.assert_called_once()


@pytest.mark.anyio
async def test_get_exam_analysis_returns_404_when_analysis_missing() -> None:
    subject = _stub_user()
    course = _stub_course()
    upload_repo = MagicMock()
    membership_repo = MagicMock()
    exam_analysis_svc = MagicMock()
    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload = _stub_upload_record()
    upload.analysis_data = None
    upload_repo.get_by_id.return_value = upload

    with pytest.raises(HTTPException) as exc_info:
        await get_exam_analysis(subject, course, 22, upload_repo, membership_repo, exam_analysis_svc)

    assert exc_info.value.status_code == 404


@pytest.mark.anyio
async def test_get_exam_analysis_returns_404_when_stored_analysis_is_malformed() -> None:
    subject = _stub_user()
    course = _stub_course()
    upload_repo = MagicMock()
    membership_repo = MagicMock()
    exam_analysis_svc = MagicMock()
    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload = _stub_upload_record()
    upload.analysis_data = {"completely_invalid": "data"}
    upload_repo.get_by_id.return_value = upload

    with pytest.raises(HTTPException) as exc_info:
        await get_exam_analysis(subject, course, 22, upload_repo, membership_repo, exam_analysis_svc)

    assert exc_info.value.status_code == 404


@pytest.mark.anyio
async def test_get_exam_analysis_returns_403_when_not_enrolled() -> None:
    subject = _stub_user()
    course = _stub_course()
    upload_repo = MagicMock()
    membership_repo = MagicMock()
    exam_analysis_svc = MagicMock()
    membership_repo.get_by_user_and_course.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await get_exam_analysis(subject, course, 22, upload_repo, membership_repo, exam_analysis_svc)

    assert exc_info.value.status_code == 403


@pytest.mark.anyio
async def test_get_exam_analysis_returns_404_when_upload_missing() -> None:
    subject = _stub_user()
    course = _stub_course()
    upload_repo = MagicMock()
    membership_repo = MagicMock()
    exam_analysis_svc = MagicMock()
    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await get_exam_analysis(subject, course, 999, upload_repo, membership_repo, exam_analysis_svc)

    assert exc_info.value.status_code == 404


@pytest.mark.anyio
async def test_get_exam_analysis_returns_404_for_mismatched_course() -> None:
    subject = _stub_user()
    course = _stub_course(course_id=1)
    upload_repo = MagicMock()
    membership_repo = MagicMock()
    exam_analysis_svc = MagicMock()
    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = _stub_upload_record(course_id=2)

    with pytest.raises(HTTPException) as exc_info:
        await get_exam_analysis(subject, course, 22, upload_repo, membership_repo, exam_analysis_svc)

    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# list_exam_pdf_uploads
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_exam_pdf_uploads_returns_all_uploads_for_student() -> None:
    subject = _stub_user(pid=123456789)
    course = _stub_course(course_id=1)
    upload_repo = MagicMock()
    practice_repo = MagicMock()
    membership_repo = MagicMock()
    membership_repo.get_by_user_and_course.return_value = MagicMock()

    upload1 = _stub_upload_record(record_id=1, course_id=1, uploader_pid=123456789)
    upload1.created_at = datetime(2026, 4, 10, tzinfo=timezone.utc)
    upload1.analysis_data = {"strengths": ["Algebra"]}

    upload2 = _stub_upload_record(record_id=2, course_id=1, uploader_pid=123456789)
    upload2.created_at = datetime(2026, 4, 15, tzinfo=timezone.utc)
    upload2.analysis_data = None

    upload_repo.list_by_student_and_course.return_value = [upload2, upload1]  # Newest first

    pm1 = MagicMock()
    pm1.upload_id = 2
    practice_repo.list_by_student_and_course.return_value = [pm1]

    result = await list_exam_pdf_uploads(subject, course, upload_repo, practice_repo, membership_repo)

    assert len(result) == 2
    assert isinstance(result[0], ExamPdfHistoryItem)
    assert result[0].id == 2
    assert result[0].original_filename == "exam.pdf"
    assert result[0].has_analysis is False
    assert result[0].has_practice is True
    assert result[1].id == 1
    assert result[1].has_analysis is True
    assert result[1].has_practice is False


@pytest.mark.anyio
async def test_list_exam_pdf_uploads_returns_empty_list_when_no_uploads() -> None:
    subject = _stub_user(pid=123456789)
    course = _stub_course(course_id=1)
    upload_repo = MagicMock()
    practice_repo = MagicMock()
    membership_repo = MagicMock()
    membership_repo.get_by_user_and_course.return_value = MagicMock()

    upload_repo.list_by_student_and_course.return_value = []
    practice_repo.list_by_student_and_course.return_value = []

    result = await list_exam_pdf_uploads(subject, course, upload_repo, practice_repo, membership_repo)

    assert result == []


@pytest.mark.anyio
async def test_list_exam_pdf_uploads_returns_403_when_not_enrolled() -> None:
    subject = _stub_user(pid=123456789)
    course = _stub_course(course_id=1)
    upload_repo = MagicMock()
    practice_repo = MagicMock()
    membership_repo = MagicMock()
    membership_repo.get_by_user_and_course.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await list_exam_pdf_uploads(subject, course, upload_repo, practice_repo, membership_repo)

    assert exc_info.value.status_code == 403


@pytest.mark.integration
def test_list_exam_pdf_uploads_accepts_get_request(client: TestClient) -> None:
    subject = _stub_user(pid=123456789)
    course = _stub_course(course_id=1)
    upload_repo = MagicMock()
    practice_repo = MagicMock()
    membership_repo = MagicMock()
    membership_repo.get_by_user_and_course.return_value = MagicMock()

    upload1 = _stub_upload_record(record_id=1, course_id=1, uploader_pid=123456789)
    upload_repo.list_by_student_and_course.return_value = [upload1]
    practice_repo.list_by_student_and_course.return_value = []

    from api.di import (
        exam_pdf_upload_repository_factory,
        membership_repository_factory,
        practice_material_repository_factory,
    )

    app.dependency_overrides[get_authenticated_user] = lambda: subject
    app.dependency_overrides[get_course_by_path_id] = lambda: course
    app.dependency_overrides[exam_pdf_upload_repository_factory] = lambda: upload_repo
    app.dependency_overrides[practice_material_repository_factory] = lambda: practice_repo
    app.dependency_overrides[membership_repository_factory] = lambda: membership_repo

    response = client.get("/api/courses/1/exam-pdfs")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == 1
    assert data[0]["has_practice"] is False
