# Copyright (c) 2026 Kris Jordan
# SPDX-License-Identifier: MIT

"""Background job handler for exam PDF analysis."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session

from ..config import get_settings
from ..jobs.base_job_handler import BaseJobHandler
from ..models.exam_analysis import ExamAnalysisJob, ExamAnalysisJobInput
from ..repositories.async_job_repository import AsyncJobRepository
from ..repositories.exam_pdf_text_repository import ExamPdfTextRepository
from ..repositories.exam_pdf_upload_repository import ExamPdfUploadRepository
from ..services.ai_completion_service import AiCompletionService
from ..services.exam_analysis_service import ExamAnalysisService
from ..tables.async_job import AsyncJobStatus


class ExamAnalysisJobHandler(BaseJobHandler[ExamAnalysisJob]):
    """Processes a queued exam PDF analysis request.

    Session lifecycle, PROCESSING transition, commit/rollback, and
    notification are handled by :class:`BaseJobHandler`. This handler
    loads the async job input payload, analyzes the extracted exam text,
    and marks the async job completed when successful.
    """

    def _execute(  # type: ignore[override]
        self,
        job: ExamAnalysisJob,
        session: Session,
    ) -> None:
        """Analyzes extracted exam text via the shared AI service.

        Args:
            job: Job payload containing the async job ID.
            session: Open database session shared by the handler.
        """
        settings = get_settings()
        if not settings.openai_api_key:
            raise RuntimeError("openai_api_key is not configured. Set OPENAI_API_KEY or AZURE_OPENAI_API_KEY.")

        async_job_repo = AsyncJobRepository(session)
        async_job = async_job_repo.get_by_id(job.job_id)
        if async_job is None:
            raise ValueError(f"AsyncJob {job.job_id} not found")

        job_input = ExamAnalysisJobInput.model_validate(async_job.input_data)

        exam_pdf_upload_repo = ExamPdfUploadRepository(session)
        upload = exam_pdf_upload_repo.get_by_id(job_input.upload_id)
        if upload is None:
            raise ValueError(f"ExamPdfUpload {job_input.upload_id} not found")

        exam_pdf_text_repo = ExamPdfTextRepository(session)

        extracted = exam_pdf_text_repo.get_by_upload_id(job_input.upload_id)
        extracted_text = extracted.extracted_text if extracted is not None else ""

        analysis_service = ExamAnalysisService(
            AiCompletionService(
                api_key=settings.openai_api_key,
                model=settings.openai_model,
                endpoint=settings.openai_endpoint,
                api_version=settings.openai_api_version,
            ),
            exam_pdf_text_repo,
        )

        try:
            analysis = analysis_service.analyze_from_text(extracted_text)
            upload.analysis_data = analysis.model_dump()
            exam_pdf_upload_repo.update(upload)

            async_job.output_data = {"analysis": analysis.model_dump()}
            async_job.status = AsyncJobStatus.COMPLETED
            async_job.completed_at = datetime.now(timezone.utc)
        except Exception:
            async_job.status = AsyncJobStatus.FAILED
            async_job.completed_at = datetime.now(timezone.utc)
            raise
        finally:
            async_job_repo.update(async_job)
