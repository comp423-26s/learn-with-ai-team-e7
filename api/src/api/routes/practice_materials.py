"""Practice material generation and retrieval routes for exam uploads."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Response
from learnwithai.models.practice_material import PRACTICE_MATERIAL_KIND, PracticeMaterialJob, PracticeMaterialJobInput
from learnwithai.tables.async_job import AsyncJob, AsyncJobStatus
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
from learnwithai.tables.practice_material import PracticeMaterial

from ..di import (
    AsyncJobRepositoryDI,
    AuthenticatedUserDI,
    CourseByCourseIDPathDI,
    ExamPdfUploadRepositoryDI,
    JobQueueDI,
    MembershipRepositoryDI,
    PracticeMaterialRepositoryDI,
)
from ..models import PracticeMaterialGenerateResponse, PracticeMaterialResponse

router = APIRouter(prefix="/courses/{course_id}/exam-pdfs", tags=["Exam PDFs"])


@router.post(
    "/{upload_id}/practice",
    response_model=PracticeMaterialGenerateResponse | PracticeMaterialResponse,
    status_code=200,
    summary="Generate exam practice materials",
    response_description="Either queued generation info or existing generated practice materials.",
    responses={
        401: {"description": "Not authenticated."},
        403: {"description": "Insufficient permissions."},
        404: {"description": "Upload not found."},
    },
)
def generate_practice_materials(
    subject: AuthenticatedUserDI,
    course: CourseByCourseIDPathDI,
    upload_id: Annotated[int, Path(gt=0)],
    response: Response,
    membership_repo: MembershipRepositoryDI,
    exam_pdf_upload_repo: ExamPdfUploadRepositoryDI,
    practice_material_repo: PracticeMaterialRepositoryDI,
    async_job_repo: AsyncJobRepositoryDI,
    job_queue: JobQueueDI,
) -> PracticeMaterialGenerateResponse | PracticeMaterialResponse:
    """Queues practice material generation unless one already exists.

    The endpoint is idempotent for a given upload: if generated materials
    already exist, they are returned immediately and no new job is enqueued.
    """
    _get_authorized_upload(subject, course, upload_id, membership_repo, exam_pdf_upload_repo)

    existing = practice_material_repo.get_by_upload_id(upload_id)
    if existing is not None:
        return _build_practice_material_response(existing)

    assert course.id is not None
    job_input = PracticeMaterialJobInput(upload_id=upload_id, student_pid=subject.pid, course_id=course.id)
    async_job = async_job_repo.create(
        AsyncJob(
            course_id=course.id,
            created_by_pid=subject.pid,
            kind=PRACTICE_MATERIAL_KIND,
            status=AsyncJobStatus.PENDING,
            input_data=job_input.model_dump(),
        )
    )
    assert async_job.id is not None
    job_queue.enqueue(PracticeMaterialJob(job_id=async_job.id))
    response.status_code = 202
    return PracticeMaterialGenerateResponse(job_id=async_job.id, status=async_job.status)


@router.get(
    "/{upload_id}/practice",
    response_model=PracticeMaterialResponse,
    status_code=200,
    summary="Get generated exam practice materials",
    response_description="Generated practice questions and flashcards for an exam upload.",
    responses={
        401: {"description": "Not authenticated."},
        403: {"description": "Insufficient permissions."},
        404: {"description": "Upload or practice materials not found."},
    },
)
def get_practice_materials(
    subject: AuthenticatedUserDI,
    course: CourseByCourseIDPathDI,
    upload_id: Annotated[int, Path(gt=0)],
    membership_repo: MembershipRepositoryDI,
    exam_pdf_upload_repo: ExamPdfUploadRepositoryDI,
    practice_material_repo: PracticeMaterialRepositoryDI,
) -> PracticeMaterialResponse:
    """Returns generated practice materials for an authorized upload owner."""
    _get_authorized_upload(subject, course, upload_id, membership_repo, exam_pdf_upload_repo)

    material = practice_material_repo.get_by_upload_id(upload_id)
    if material is None:
        raise HTTPException(status_code=404, detail="Practice materials not found.")

    return _build_practice_material_response(material)


def _get_authorized_upload(
    subject: AuthenticatedUserDI,
    course: CourseByCourseIDPathDI,
    upload_id: int,
    membership_repo: MembershipRepositoryDI,
    exam_pdf_upload_repo: ExamPdfUploadRepositoryDI,
) -> ExamPdfUpload:
    """Loads upload after validating enrollment, ownership, and course scoping."""
    membership = membership_repo.get_by_user_and_course(subject, course)
    if membership is None:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")

    upload = exam_pdf_upload_repo.get_by_id(upload_id)
    if upload is None or upload.course_id != course.id:
        raise HTTPException(status_code=404, detail="Upload not found.")

    if upload.uploader_pid != subject.pid:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")

    return upload


def _build_practice_material_response(material: PracticeMaterial) -> PracticeMaterialResponse:
    """Normalizes table data into the public API response model."""
    return PracticeMaterialResponse(
        id=material.id,  # type: ignore[arg-type]
        upload_id=material.upload_id,
        student_pid=material.student_pid,
        course_id=material.course_id,
        generated_at=material.generated_at,
        weak_topics=material.material_data["weak_topics"],
        questions=material.material_data["questions"],
        flashcards=material.material_data["flashcards"],
    )
