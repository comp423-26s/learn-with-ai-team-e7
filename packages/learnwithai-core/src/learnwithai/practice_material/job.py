"""Background job handler for practice material generation."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session

from ..config import get_settings
from ..jobs.base_job_handler import BaseJobHandler
from ..models.practice_material import PracticeMaterialJob, PracticeMaterialJobInput
from ..repositories.async_job_repository import AsyncJobRepository
from ..repositories.exam_pdf_text_repository import ExamPdfTextRepository
from ..repositories.exam_pdf_upload_repository import ExamPdfUploadRepository
from ..repositories.practice_material_repository import PracticeMaterialRepository
from ..services.ai_completion_service import AiCompletionService
from ..services.practice_material_service import PracticeMaterialService
from ..tables.async_job import AsyncJobStatus


class PracticeMaterialJobHandler(BaseJobHandler[PracticeMaterialJob]):
    """Processes a queued practice material generation request.

    Session lifecycle, PROCESSING transition, commit/rollback, and
    notification are handled by :class:`BaseJobHandler`. This handler
    loads the async job input payload, generates practice materials,
    and marks the async job completed when successful.
    """

    def _execute(  # type: ignore[override]
        self,
        job: PracticeMaterialJob,
        session: Session,
    ) -> None:
        """Generates practice materials via the shared AI service.

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

        job_input = PracticeMaterialJobInput.model_validate(async_job.input_data)

        practice_material_service = PracticeMaterialService(
            AiCompletionService(
                api_key=settings.openai_api_key,
                model=settings.openai_model,
                endpoint=settings.openai_endpoint,
                api_version=settings.openai_api_version,
            ),
            ExamPdfUploadRepository(session),
            ExamPdfTextRepository(session),
            PracticeMaterialRepository(session),
        )
        material = practice_material_service.generate_materials(
            job_input.upload_id,
            job_input.student_pid,
            job_input.course_id,
        )

        if material.id is not None:
            material.async_job_id = async_job.id
            PracticeMaterialRepository(session).update(material)

        async_job.output_data = {
            "practice_material_id": material.id,
            "material_data": material.material_data,
        }
        async_job.status = AsyncJobStatus.COMPLETED
        async_job.completed_at = datetime.now(timezone.utc)
        async_job_repo.update(async_job)
