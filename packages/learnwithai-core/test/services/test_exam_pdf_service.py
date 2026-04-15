from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from learnwithai.errors import AuthorizationError
from learnwithai.interfaces import ObjectStorage
from learnwithai.repositories.exam_pdf_upload_repository import ExamPdfUploadRepository
from learnwithai.repositories.membership_repository import MembershipRepository
from learnwithai.services.exam_pdf_service import ExamPdfService
from learnwithai.tables.course import Course, Term
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
from learnwithai.tables.membership import Membership, MembershipState, MembershipType
from learnwithai.tables.user import User


def _build_service(
    exam_pdf_upload_repo: ExamPdfUploadRepository | None = None,
    membership_repo: MembershipRepository | None = None,
    object_storage: ObjectStorage | None = None,
) -> ExamPdfService:
    if exam_pdf_upload_repo is None:
        exam_pdf_upload_repo = MagicMock(spec=ExamPdfUploadRepository)
    if membership_repo is None:
        membership_repo = MagicMock(spec=MembershipRepository)
    if object_storage is None:
        object_storage = MagicMock(spec=ObjectStorage)
    return ExamPdfService(exam_pdf_upload_repo, membership_repo, object_storage)


def _make_user(pid: int = 123456789) -> User:
    mock = MagicMock(spec=User)
    mock.pid = pid
    mock.name = "Test User"
    mock.onyen = "testuser"
    return mock  # type: ignore[return-value]


def _make_course(course_id: int = 1) -> Course:
    mock = MagicMock(spec=Course)
    mock.id = course_id
    mock.course_number = "COMP101"
    mock.name = "Intro to CS"
    mock.description = ""
    mock.term = Term.FALL
    mock.year = 2026
    return mock  # type: ignore[return-value]


def _make_membership(
    membership_type: MembershipType = MembershipType.STUDENT,
    state: MembershipState = MembershipState.ENROLLED,
) -> Membership:
    mock = MagicMock(spec=Membership)
    mock.type = membership_type
    mock.state = state
    return mock  # type: ignore[return-value]


def _make_upload_record() -> ExamPdfUpload:
    return ExamPdfUpload.model_construct(
        _fields_set=None,
        id=22,
        course_id=1,
        uploader_pid=123456789,
        storage_key="courses/1/exam-pdfs/123/key.pdf",
        original_filename="exam.pdf",
        content_type="application/pdf",
        size_bytes=123,
        created_at=None,
    )


def test_upload_pdf_stores_metadata_for_enrolled_member() -> None:
    exam_pdf_upload_repo = MagicMock(spec=ExamPdfUploadRepository)
    membership_repo = MagicMock(spec=MembershipRepository)
    object_storage = MagicMock(spec=ObjectStorage)
    membership_repo.get_by_user_and_course.return_value = _make_membership()
    exam_pdf_upload_repo.create.return_value = _make_upload_record()
    service = _build_service(exam_pdf_upload_repo, membership_repo, object_storage)
    subject = _make_user()
    course = _make_course()

    result = service.upload_pdf(subject, course, "exam.pdf", b"%PDF-1.7")

    assert result.id == 22
    object_storage.upload_pdf.assert_called_once()
    created = exam_pdf_upload_repo.create.call_args.args[0]
    assert created.course_id == course.id
    assert created.uploader_pid == subject.pid
    assert created.original_filename == "exam.pdf"
    assert created.content_type == "application/pdf"
    assert created.size_bytes == len(b"%PDF-1.7")


def test_upload_pdf_raises_for_non_member() -> None:
    membership_repo = MagicMock(spec=MembershipRepository)
    membership_repo.get_by_user_and_course.return_value = None
    service = _build_service(membership_repo=membership_repo)

    with pytest.raises(AuthorizationError):
        service.upload_pdf(_make_user(), _make_course(), "exam.pdf", b"%PDF-1.7")


def test_upload_pdf_raises_for_non_enrolled_member() -> None:
    membership_repo = MagicMock(spec=MembershipRepository)
    membership_repo.get_by_user_and_course.return_value = _make_membership(state=MembershipState.DROPPED)
    service = _build_service(membership_repo=membership_repo)

    with pytest.raises(AuthorizationError):
        service.upload_pdf(_make_user(), _make_course(), "exam.pdf", b"%PDF-1.7")


def test_upload_pdf_raises_for_unpersisted_course() -> None:
    membership_repo = MagicMock(spec=MembershipRepository)
    membership_repo.get_by_user_and_course.return_value = _make_membership()
    service = _build_service(membership_repo=membership_repo)

    course = _make_course()
    course.id = None

    with pytest.raises(ValueError, match="Course must be persisted"):
        service.upload_pdf(_make_user(), course, "exam.pdf", b"%PDF-1.7")


def test_upload_pdf_raises_runtime_error_when_storage_fails() -> None:
    membership_repo = MagicMock(spec=MembershipRepository)
    object_storage = MagicMock(spec=ObjectStorage)
    membership_repo.get_by_user_and_course.return_value = _make_membership()
    object_storage.upload_pdf.side_effect = RuntimeError("S3 down")
    service = _build_service(membership_repo=membership_repo, object_storage=object_storage)

    with pytest.raises(RuntimeError):
        service.upload_pdf(_make_user(), _make_course(), "exam.pdf", b"%PDF-1.7")
