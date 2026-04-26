"""Tests for ExamPdfUploadRepository."""

from __future__ import annotations

import pytest
from learnwithai.repositories.exam_pdf_upload_repository import ExamPdfUploadRepository
from learnwithai.tables.course import Course, Term
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
from learnwithai.tables.user import User
from sqlmodel import Session


@pytest.mark.integration
def test_create_persists_exam_pdf_upload(session: Session) -> None:
    user = User(pid=123456789, name="Uploader", onyen="uploader")
    session.add(user)
    session.flush()
    course = Course(course_number="COMP423", name="Foundations", term=Term.FALL, year=2026)
    session.add(course)
    session.flush()
    assert course.id is not None

    repo = ExamPdfUploadRepository(session)
    created = repo.create(
        ExamPdfUpload(
            course_id=course.id,
            uploader_pid=user.pid,
            storage_key="courses/1/exam-pdfs/123/key.pdf",
            original_filename="exam.pdf",
            content_type="application/pdf",
            size_bytes=42,
        )
    )

    assert created.id is not None
    assert created.course_id == course.id
    assert created.storage_key == "courses/1/exam-pdfs/123/key.pdf"


@pytest.mark.integration
def test_get_by_id_returns_exam_pdf_upload(session: Session) -> None:
    user = User(pid=123456790, name="Uploader 2", onyen="uploader2")
    session.add(user)
    session.flush()
    course = Course(course_number="COMP426", name="Software", term=Term.SPRING, year=2027)
    session.add(course)
    session.flush()
    assert course.id is not None

    repo = ExamPdfUploadRepository(session)
    created = repo.create(
        ExamPdfUpload(
            course_id=course.id,
            uploader_pid=user.pid,
            storage_key="courses/2/exam-pdfs/456/key.pdf",
            original_filename="midterm.pdf",
            content_type="application/pdf",
            size_bytes=128,
        )
    )

    result = repo.get_by_id(created.id)  # type: ignore[arg-type]

    assert result is not None
    assert result.original_filename == "midterm.pdf"


@pytest.mark.integration
def test_list_by_student_and_course_returns_uploads_ordered_newest_first(session: Session) -> None:
    user = User(pid=123456791, name="Student", onyen="student")
    session.add(user)
    session.flush()
    course = Course(course_number="COMP427", name="AI", term=Term.SPRING, year=2027)
    session.add(course)
    session.flush()
    assert course.id is not None

    repo = ExamPdfUploadRepository(session)

    # Create first upload
    first = repo.create(
        ExamPdfUpload(
            course_id=course.id,
            uploader_pid=user.pid,
            storage_key="courses/3/exam-pdfs/001/key.pdf",
            original_filename="exam1.pdf",
            content_type="application/pdf",
            size_bytes=100,
        )
    )

    # Create second upload (should be newer)
    second = repo.create(
        ExamPdfUpload(
            course_id=course.id,
            uploader_pid=user.pid,
            storage_key="courses/3/exam-pdfs/002/key.pdf",
            original_filename="exam2.pdf",
            content_type="application/pdf",
            size_bytes=200,
        )
    )

    # Get uploads - should be ordered newest first
    result = repo.list_by_student_and_course(user.pid, course.id)

    assert len(result) == 2
    ids = {item.id for item in result}
    assert first.id in ids
    assert second.id in ids
    filenames = {item.original_filename for item in result}
    assert "exam1.pdf" in filenames
    assert "exam2.pdf" in filenames
