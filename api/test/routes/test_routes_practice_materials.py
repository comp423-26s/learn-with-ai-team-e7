"""Tests for practice material route handlers."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, Response
from learnwithai.tables.async_job import AsyncJob, AsyncJobStatus
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
from learnwithai.tables.practice_material import PracticeMaterial

from api.models import PracticeMaterialGenerateResponse, PracticeMaterialResponse
from api.routes.practice_materials import generate_practice_materials, get_practice_materials


def _stub_user(pid: int = 123456789) -> MagicMock:
    mock = MagicMock()
    mock.pid = pid
    return mock


def _stub_course(course_id: int = 1) -> MagicMock:
    mock = MagicMock()
    mock.id = course_id
    return mock


def _stub_upload(upload_id: int = 22, course_id: int = 1, uploader_pid: int = 123456789) -> MagicMock:
    mock = MagicMock(spec=ExamPdfUpload)
    mock.id = upload_id
    mock.course_id = course_id
    mock.uploader_pid = uploader_pid
    return mock


def _material_payload(upload_id: int = 22) -> dict:
    return {
        "upload_id": upload_id,
        "weak_topics": ["Geometry"],
        "questions": [
            {
                "question_text": "What is a right triangle?",
                "answer": "A triangle with one 90 degree angle.",
                "topic": "Geometry",
                "difficulty": "easy",
            }
        ],
        "flashcards": [
            {
                "front": "Pythagorean theorem",
                "back": "a^2 + b^2 = c^2",
                "topic": "Geometry",
            }
        ],
    }


def _stub_material(
    material_id: int = 10, upload_id: int = 22, student_pid: int = 123456789, course_id: int = 1
) -> MagicMock:
    mock = MagicMock(spec=PracticeMaterial)
    mock.id = material_id
    mock.upload_id = upload_id
    mock.student_pid = student_pid
    mock.course_id = course_id
    mock.generated_at = datetime(2026, 4, 26, tzinfo=timezone.utc)
    mock.material_data = _material_payload(upload_id)
    return mock


def _stub_async_job(job_id: int = 7, course_id: int = 1, created_by_pid: int = 123456789) -> MagicMock:
    mock = MagicMock(spec=AsyncJob)
    mock.id = job_id
    mock.course_id = course_id
    mock.created_by_pid = created_by_pid
    mock.status = AsyncJobStatus.PENDING
    return mock


def test_generate_practice_materials_returns_pending_job_for_new_request() -> None:
    subject = _stub_user()
    course = _stub_course()
    response = Response()
    membership_repo = MagicMock()
    upload_repo = MagicMock()
    practice_repo = MagicMock()
    async_job_repo = MagicMock()
    job_queue = MagicMock()

    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = _stub_upload()
    practice_repo.get_by_upload_id.return_value = None
    async_job_repo.create.return_value = _stub_async_job(job_id=77)

    result = generate_practice_materials(
        subject,
        course,
        22,
        response,
        membership_repo,
        upload_repo,
        practice_repo,
        async_job_repo,
        job_queue,
    )

    assert isinstance(result, PracticeMaterialGenerateResponse)
    assert result.job_id == 77
    assert result.status == AsyncJobStatus.PENDING
    assert response.status_code == 202
    async_job_repo.create.assert_called_once()
    job_queue.enqueue.assert_called_once()


def test_generate_practice_materials_returns_existing_material_idempotently() -> None:
    subject = _stub_user()
    course = _stub_course()
    response = Response()
    membership_repo = MagicMock()
    upload_repo = MagicMock()
    practice_repo = MagicMock()
    async_job_repo = MagicMock()
    job_queue = MagicMock()

    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = _stub_upload()
    practice_repo.get_by_upload_id.return_value = _stub_material(material_id=99)

    result = generate_practice_materials(
        subject,
        course,
        22,
        response,
        membership_repo,
        upload_repo,
        practice_repo,
        async_job_repo,
        job_queue,
    )

    assert isinstance(result, PracticeMaterialResponse)
    assert result.id == 99
    assert result.upload_id == 22
    assert result.weak_topics == ["Geometry"]
    assert response.status_code == 200
    async_job_repo.create.assert_not_called()
    job_queue.enqueue.assert_not_called()


def test_get_practice_materials_returns_generated_material() -> None:
    subject = _stub_user()
    course = _stub_course()
    membership_repo = MagicMock()
    upload_repo = MagicMock()
    practice_repo = MagicMock()

    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = _stub_upload()
    practice_repo.get_by_upload_id.return_value = _stub_material(material_id=11)

    result = get_practice_materials(subject, course, 22, membership_repo, upload_repo, practice_repo)

    assert isinstance(result, PracticeMaterialResponse)
    assert result.id == 11
    assert result.questions[0].question_text == "What is a right triangle?"


def test_get_practice_materials_returns_404_when_not_generated() -> None:
    subject = _stub_user()
    course = _stub_course()
    membership_repo = MagicMock()
    upload_repo = MagicMock()
    practice_repo = MagicMock()

    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = _stub_upload()
    practice_repo.get_by_upload_id.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        get_practice_materials(subject, course, 22, membership_repo, upload_repo, practice_repo)

    assert exc_info.value.status_code == 404


def test_generate_practice_materials_rejects_unauthorized_user() -> None:
    subject = _stub_user(pid=200)
    course = _stub_course()
    response = Response()
    membership_repo = MagicMock()
    upload_repo = MagicMock()
    practice_repo = MagicMock()
    async_job_repo = MagicMock()
    job_queue = MagicMock()

    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = _stub_upload(uploader_pid=100)

    with pytest.raises(HTTPException) as exc_info:
        generate_practice_materials(
            subject,
            course,
            22,
            response,
            membership_repo,
            upload_repo,
            practice_repo,
            async_job_repo,
            job_queue,
        )

    assert exc_info.value.status_code == 403
    async_job_repo.create.assert_not_called()
    job_queue.enqueue.assert_not_called()


def test_generate_practice_materials_rejects_user_not_enrolled() -> None:
    subject = _stub_user()
    course = _stub_course()
    response = Response()
    membership_repo = MagicMock()
    upload_repo = MagicMock()
    practice_repo = MagicMock()
    async_job_repo = MagicMock()
    job_queue = MagicMock()

    membership_repo.get_by_user_and_course.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        generate_practice_materials(
            subject,
            course,
            22,
            response,
            membership_repo,
            upload_repo,
            practice_repo,
            async_job_repo,
            job_queue,
        )

    assert exc_info.value.status_code == 403


def test_get_practice_materials_returns_404_when_upload_missing() -> None:
    subject = _stub_user()
    course = _stub_course()
    membership_repo = MagicMock()
    upload_repo = MagicMock()
    practice_repo = MagicMock()

    membership_repo.get_by_user_and_course.return_value = MagicMock()
    upload_repo.get_by_id.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        get_practice_materials(subject, course, 22, membership_repo, upload_repo, practice_repo)

    assert exc_info.value.status_code == 404
