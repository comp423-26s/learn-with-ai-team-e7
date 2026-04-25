"""Tests for PracticeMaterialJobHandler."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from learnwithai.models.practice_material import PracticeMaterialJob, PracticeMaterialJobInput
from learnwithai.practice_material.job import PracticeMaterialJobHandler
from learnwithai.tables.async_job import AsyncJob, AsyncJobStatus
from learnwithai.tables.practice_material import PracticeMaterial


def test_practice_material_job_type() -> None:
    job = PracticeMaterialJob(job_id=1)
    assert job.type == "practice_material"


def test_practice_material_job_input_round_trips() -> None:
    model = PracticeMaterialJobInput(upload_id=11, student_pid=222, course_id=333)
    restored = PracticeMaterialJobInput.model_validate(model.model_dump())
    assert restored.upload_id == 11
    assert restored.student_pid == 222
    assert restored.course_id == 333


def test_handler_completes_and_links_generated_material() -> None:
    job_payload = PracticeMaterialJob(job_id=42)
    handler = PracticeMaterialJobHandler()
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_notifier = MagicMock()

    async_job = AsyncJob(
        id=42,
        course_id=7,
        created_by_pid=123456789,
        kind="practice_material",
        status=AsyncJobStatus.PENDING,
        input_data={"upload_id": 11, "student_pid": 222, "course_id": 7},
    )

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = async_job
    async_job_repo_cls.return_value = async_job_repo_instance

    practice_material_repo_cls = MagicMock()
    practice_material_repo_instance = MagicMock()
    practice_material_repo_cls.return_value = practice_material_repo_instance

    mock_material = PracticeMaterial(
        id=99,
        upload_id=11,
        student_pid=222,
        course_id=7,
        material_data={"upload_id": 11},
        generated_at=datetime.now(timezone.utc),
    )
    mock_service = MagicMock()
    mock_service.generate_materials.return_value = mock_material

    mock_settings = MagicMock()
    mock_settings.openai_api_key = "sk-test"
    mock_settings.openai_model = "gpt-5-mini"

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.PracticeMaterialRepository", practice_material_repo_cls),
        patch("learnwithai.practice_material.job.ExamPdfUploadRepository", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.ExamPdfTextRepository", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.AiCompletionService", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.PracticeMaterialService", return_value=mock_service),
        patch("learnwithai.practice_material.job.get_settings", return_value=mock_settings),
    ):
        handler.handle(job_payload)

    mock_service.generate_materials.assert_called_once_with(11, 222, 7)
    assert async_job.status == AsyncJobStatus.COMPLETED
    assert async_job.completed_at is not None
    assert async_job.output_data == {"practice_material_id": 99, "material_data": {"upload_id": 11}}
    assert mock_material.async_job_id == 42
    practice_material_repo_instance.update.assert_called_once_with(mock_material)
    mock_session.commit.assert_called_once()
    mock_session.rollback.assert_not_called()


def test_handler_rolls_back_when_generation_fails() -> None:
    job_payload = PracticeMaterialJob(job_id=42)
    handler = PracticeMaterialJobHandler()
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_notifier = MagicMock()

    async_job = AsyncJob(
        id=42,
        course_id=7,
        created_by_pid=123456789,
        kind="practice_material",
        status=AsyncJobStatus.PENDING,
        input_data={"upload_id": 11, "student_pid": 222, "course_id": 7},
    )

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = async_job
    async_job_repo_cls.return_value = async_job_repo_instance

    mock_service = MagicMock()
    mock_service.generate_materials.side_effect = RuntimeError("API error")

    mock_settings = MagicMock()
    mock_settings.openai_api_key = "sk-test"
    mock_settings.openai_model = "gpt-5-mini"

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.PracticeMaterialRepository", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.ExamPdfUploadRepository", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.ExamPdfTextRepository", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.AiCompletionService", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.PracticeMaterialService", return_value=mock_service),
        patch("learnwithai.practice_material.job.get_settings", return_value=mock_settings),
        pytest.raises(RuntimeError, match="API error"),
    ):
        handler.handle(job_payload)

    assert async_job.status == AsyncJobStatus.FAILED
    assert async_job.completed_at is not None
    mock_session.rollback.assert_called_once()


def test_handler_raises_when_api_key_not_set() -> None:
    job_payload = PracticeMaterialJob(job_id=42)
    handler = PracticeMaterialJobHandler()
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_notifier = MagicMock()

    async_job = AsyncJob(
        id=42,
        course_id=7,
        created_by_pid=123456789,
        kind="practice_material",
        status=AsyncJobStatus.PENDING,
        input_data={"upload_id": 11, "student_pid": 222, "course_id": 7},
    )

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = async_job
    async_job_repo_cls.return_value = async_job_repo_instance

    mock_settings = MagicMock()
    mock_settings.openai_api_key = None

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.get_settings", return_value=mock_settings),
        pytest.raises(RuntimeError, match="openai_api_key is not configured"),
    ):
        handler.handle(job_payload)

    assert async_job.status == AsyncJobStatus.FAILED
    assert async_job.completed_at is not None
    mock_session.rollback.assert_called_once()


def test_handler_raises_when_async_job_not_found() -> None:
    job_payload = PracticeMaterialJob(job_id=42)
    handler = PracticeMaterialJobHandler()
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_notifier = MagicMock()

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = None
    async_job_repo_cls.return_value = async_job_repo_instance

    mock_settings = MagicMock()
    mock_settings.openai_api_key = "sk-test"
    mock_settings.openai_model = "gpt-5-mini"
    mock_settings.openai_endpoint = "https://example.com"
    mock_settings.openai_api_version = "2025-04-01-preview"

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.get_settings", return_value=mock_settings),
        pytest.raises(ValueError, match="AsyncJob 42 not found"),
    ):
        handler.handle(job_payload)


def test_handler_skips_linking_when_generated_material_has_no_id() -> None:
    job_payload = PracticeMaterialJob(job_id=42)
    handler = PracticeMaterialJobHandler()
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_notifier = MagicMock()

    async_job = AsyncJob(
        id=42,
        course_id=7,
        created_by_pid=123456789,
        kind="practice_material",
        status=AsyncJobStatus.PENDING,
        input_data={"upload_id": 11, "student_pid": 222, "course_id": 7},
    )

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = async_job
    async_job_repo_cls.return_value = async_job_repo_instance

    practice_material_repo_cls = MagicMock()
    practice_material_repo_instance = MagicMock()
    practice_material_repo_cls.return_value = practice_material_repo_instance

    mock_material = PracticeMaterial(
        id=None,
        upload_id=11,
        student_pid=222,
        course_id=7,
        material_data={"upload_id": 11},
        generated_at=datetime.now(timezone.utc),
    )
    mock_service = MagicMock()
    mock_service.generate_materials.return_value = mock_material

    mock_settings = MagicMock()
    mock_settings.openai_api_key = "sk-test"
    mock_settings.openai_model = "gpt-5-mini"
    mock_settings.openai_endpoint = "https://example.com"
    mock_settings.openai_api_version = "2025-04-01-preview"

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.practice_material.job.PracticeMaterialRepository", practice_material_repo_cls),
        patch("learnwithai.practice_material.job.ExamPdfUploadRepository", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.ExamPdfTextRepository", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.AiCompletionService", return_value=MagicMock()),
        patch("learnwithai.practice_material.job.PracticeMaterialService", return_value=mock_service),
        patch("learnwithai.practice_material.job.get_settings", return_value=mock_settings),
    ):
        handler.handle(job_payload)

    practice_material_repo_instance.update.assert_not_called()
    assert async_job.status == AsyncJobStatus.COMPLETED
    assert async_job.output_data == {"practice_material_id": None, "material_data": {"upload_id": 11}}
