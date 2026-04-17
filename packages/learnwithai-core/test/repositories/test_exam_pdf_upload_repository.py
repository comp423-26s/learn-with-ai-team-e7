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
