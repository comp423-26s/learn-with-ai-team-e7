"""Tests for ExamAnalysisJobHandler."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from learnwithai.models.exam_analysis import ExamAnalysisJob, ExamAnalysisJobInput
from learnwithai.services.exam_analysis_job import ExamAnalysisJobHandler
from learnwithai.tables.async_job import AsyncJob, AsyncJobStatus
from learnwithai.tables.exam_pdf_text import ExamPdfText
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload


def test_exam_analysis_job_type() -> None:
    job = ExamAnalysisJob(job_id=1)
    assert job.type == "exam_analysis"


def test_exam_analysis_job_input_round_trips() -> None:
    model = ExamAnalysisJobInput(upload_id=42)
    restored = ExamAnalysisJobInput.model_validate(model.model_dump())
    assert restored.upload_id == 42


def test_handler_completes_and_updates_upload_with_analysis() -> None:
    job_payload = ExamAnalysisJob(job_id=1)
    handler = ExamAnalysisJobHandler()
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_notifier = MagicMock()

    async_job = AsyncJob(
        id=1,
        course_id=7,
        created_by_pid=123456789,
        kind="exam_analysis",
        status=AsyncJobStatus.PENDING,
        input_data={"upload_id": 42},
    )

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = async_job
    async_job_repo_cls.return_value = async_job_repo_instance

    exam_pdf_upload_repo_cls = MagicMock()
    exam_pdf_upload_repo_instance = MagicMock()
    exam_pdf_upload_repo_cls.return_value = exam_pdf_upload_repo_instance

    mock_upload = ExamPdfUpload(
        id=42,
        course_id=7,
        uploader_pid=123456789,
        storage_key="test.pdf",
        original_filename="exam.pdf",
        content_type="application/pdf",
        size_bytes=1000,
        created_at=datetime.now(timezone.utc),
    )
    exam_pdf_upload_repo_instance.get_by_id.return_value = mock_upload

    exam_pdf_text_repo_cls = MagicMock()
    exam_pdf_text_repo_instance = MagicMock()
    exam_pdf_text_repo_cls.return_value = exam_pdf_text_repo_instance

    mock_text = ExamPdfText(
        upload_id=42,
        extracted_text="Question 1: What is 2+2? A) 4 B) 5",
    )
    exam_pdf_text_repo_instance.get_by_upload_id.return_value = mock_text

    mock_analysis = MagicMock()
    mock_analysis_data = {
        "summary": "Analysis complete",
        "topics": [],
    }
    mock_analysis.model_dump.return_value = mock_analysis_data

    mock_service = MagicMock()
    mock_service.analyze_upload.return_value = mock_analysis

    mock_settings = MagicMock()
    mock_settings.openai_api_key = "sk-test"
    mock_settings.openai_model = "gpt-5-mini"
    mock_settings.openai_endpoint = None
    mock_settings.openai_api_version = None

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.services.exam_analysis_job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.services.exam_analysis_job.ExamPdfUploadRepository", exam_pdf_upload_repo_cls),
        patch("learnwithai.services.exam_analysis_job.ExamPdfTextRepository", exam_pdf_text_repo_cls),
        patch("learnwithai.services.exam_analysis_job.AiCompletionService", return_value=MagicMock()),
        patch("learnwithai.services.exam_analysis_job.ExamAnalysisService", return_value=mock_service),
        patch("learnwithai.services.exam_analysis_job.get_settings", return_value=mock_settings),
    ):
        handler.handle(job_payload)

    mock_service.analyze_upload.assert_called_once_with(42, [])
    assert async_job.status == AsyncJobStatus.COMPLETED
    assert async_job.completed_at is not None
    assert async_job.output_data == {"analysis": mock_analysis_data}
    assert mock_upload.analysis_data == mock_analysis_data
    exam_pdf_upload_repo_instance.update.assert_called_once_with(mock_upload)
    mock_session.commit.assert_called_once()
    mock_session.rollback.assert_not_called()


def test_handler_rolls_back_when_analysis_fails() -> None:
    job_payload = ExamAnalysisJob(job_id=1)
    handler = ExamAnalysisJobHandler()
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_notifier = MagicMock()

    async_job = AsyncJob(
        id=1,
        course_id=7,
        created_by_pid=123456789,
        kind="exam_analysis",
        status=AsyncJobStatus.PENDING,
        input_data={"upload_id": 42},
    )

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = async_job
    async_job_repo_cls.return_value = async_job_repo_instance

    exam_pdf_upload_repo_cls = MagicMock()
    exam_pdf_upload_repo_instance = MagicMock()
    exam_pdf_upload_repo_cls.return_value = exam_pdf_upload_repo_instance

    mock_upload = ExamPdfUpload(
        id=42,
        course_id=7,
        uploader_pid=123456789,
        storage_key="test.pdf",
        original_filename="exam.pdf",
        content_type="application/pdf",
        size_bytes=1000,
        created_at=datetime.now(timezone.utc),
    )
    exam_pdf_upload_repo_instance.get_by_id.return_value = mock_upload

    exam_pdf_text_repo_cls = MagicMock()
    exam_pdf_text_repo_instance = MagicMock()
    exam_pdf_text_repo_cls.return_value = exam_pdf_text_repo_instance

    mock_text = ExamPdfText(
        upload_id=42,
        extracted_text="Question 1: What is 2+2? A) 4 B) 5",
    )
    exam_pdf_text_repo_instance.get_by_upload_id.return_value = mock_text

    mock_service = MagicMock()
    mock_service.analyze_upload.side_effect = RuntimeError("LLM failed")

    mock_settings = MagicMock()
    mock_settings.openai_api_key = "sk-test"
    mock_settings.openai_model = "gpt-5-mini"
    mock_settings.openai_endpoint = None
    mock_settings.openai_api_version = None

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.services.exam_analysis_job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.services.exam_analysis_job.ExamPdfUploadRepository", exam_pdf_upload_repo_cls),
        patch("learnwithai.services.exam_analysis_job.ExamPdfTextRepository", exam_pdf_text_repo_cls),
        patch("learnwithai.services.exam_analysis_job.AiCompletionService", return_value=MagicMock()),
        patch("learnwithai.services.exam_analysis_job.ExamAnalysisService", return_value=mock_service),
        patch("learnwithai.services.exam_analysis_job.get_settings", return_value=mock_settings),
        pytest.raises(RuntimeError, match="LLM failed"),
    ):
        handler.handle(job_payload)

    mock_service.analyze_upload.assert_called_once_with(42, [])
    assert async_job.status == AsyncJobStatus.FAILED
    assert async_job.completed_at is not None
    mock_session.rollback.assert_called_once()


def test_handler_raises_when_api_key_not_set() -> None:
    job_payload = ExamAnalysisJob(job_id=1)
    handler = ExamAnalysisJobHandler()
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_notifier = MagicMock()

    async_job = AsyncJob(
        id=1,
        course_id=7,
        created_by_pid=123456789,
        kind="exam_analysis",
        status=AsyncJobStatus.PENDING,
        input_data={"upload_id": 42},
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
        patch("learnwithai.services.exam_analysis_job.get_settings", return_value=mock_settings),
        pytest.raises(RuntimeError, match="openai_api_key is not configured"),
    ):
        handler.handle(job_payload)


def test_handler_raises_when_async_job_not_found() -> None:
    job_payload = ExamAnalysisJob(job_id=1)
    handler = ExamAnalysisJobHandler()
    mock_session = MagicMock()
    mock_notifier = MagicMock()

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = None
    async_job_repo_cls.return_value = async_job_repo_instance

    mock_settings = MagicMock()
    mock_settings.openai_api_key = "sk-test"

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.services.exam_analysis_job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.services.exam_analysis_job.get_settings", return_value=mock_settings),
        pytest.raises(ValueError, match="AsyncJob 1 not found"),
    ):
        handler.handle(job_payload)


def test_handler_raises_when_upload_not_found() -> None:
    job_payload = ExamAnalysisJob(job_id=1)
    handler = ExamAnalysisJobHandler()
    mock_session = MagicMock()
    mock_notifier = MagicMock()

    async_job = AsyncJob(
        id=1,
        course_id=7,
        created_by_pid=123456789,
        kind="exam_analysis",
        status=AsyncJobStatus.PENDING,
        input_data={"upload_id": 42},
    )

    async_job_repo_cls = MagicMock()
    async_job_repo_instance = MagicMock()
    async_job_repo_instance.get_by_id.return_value = async_job
    async_job_repo_cls.return_value = async_job_repo_instance

    exam_pdf_upload_repo_cls = MagicMock()
    exam_pdf_upload_repo_instance = MagicMock()
    exam_pdf_upload_repo_instance.get_by_id.return_value = None
    exam_pdf_upload_repo_cls.return_value = exam_pdf_upload_repo_instance

    mock_settings = MagicMock()
    mock_settings.openai_api_key = "sk-test"

    with (
        patch.object(handler, "_build_notifier", return_value=mock_notifier),
        patch("learnwithai.db.get_engine", return_value=MagicMock()),
        patch("sqlmodel.Session", return_value=mock_session),
        patch("learnwithai.jobs.base_job_handler.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.services.exam_analysis_job.AsyncJobRepository", async_job_repo_cls),
        patch("learnwithai.services.exam_analysis_job.ExamPdfUploadRepository", exam_pdf_upload_repo_cls),
        patch("learnwithai.services.exam_analysis_job.get_settings", return_value=mock_settings),
        pytest.raises(ValueError, match="ExamPdfUpload 42 not found"),
    ):
        handler.handle(job_payload)
