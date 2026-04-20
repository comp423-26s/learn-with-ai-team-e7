from __future__ import annotations

import sys
from types import ModuleType
from typing import Any
from unittest.mock import MagicMock

from learnwithai.services.exam_pdf_service import ExamPdfService
from learnwithai.tables.course import Course, Term
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
from learnwithai.tables.membership import MembershipState
from learnwithai.tables.user import User


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


def _make_membership(state: MembershipState = MembershipState.ENROLLED):
    mock = MagicMock()
    mock.state = state
    return mock


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


def test_typed_extraction_persists_text(monkeypatch) -> None:
    """When pdfminer extracts typed text, it should be persisted."""
    # Provide repositories and storage
    upload_repo = MagicMock()
    upload_repo.create.return_value = _make_upload_record()
    membership_repo = MagicMock()
    membership_repo.get_by_user_and_course.return_value = _make_membership()
    object_storage = MagicMock()
    exam_pdf_text_repo = MagicMock()

    # Mock pdfminer.high_level.extract_text
    pdfminer_mod: Any = ModuleType("pdfminer.high_level")
    pdfminer_mod.extract_text = lambda fp: "typed extracted content"
    from __future__ import annotations

    from types import ModuleType
    from unittest.mock import MagicMock

    from learnwithai.tables.course import Course, Term
    from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
    from learnwithai.tables.membership import MembershipState
    from learnwithai.tables.user import User


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


    def _make_membership(state: MembershipState = MembershipState.ENROLLED):
        mock = MagicMock()
        mock.state = state
        return mock


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


    def test_typed_extraction_persists_text(monkeypatch) -> None:
        """When pdfminer extracts typed text, it should be persisted."""
        # Provide repositories and storage
        upload_repo = MagicMock()
        upload_repo.create.return_value = _make_upload_record()
        membership_repo = MagicMock()
        membership_repo.get_by_user_and_course.return_value = _make_membership()
        object_storage = MagicMock()
        exam_pdf_text_repo = MagicMock()

        # Mock pdfminer.high_level.extract_text
        pdfminer_mod: Any = ModuleType("pdfminer.high_level")
        pdfminer_mod.extract_text = lambda fp: "typed extracted content"
        sys.modules["pdfminer.high_level"] = pdfminer_mod

        service = ExamPdfService(upload_repo, membership_repo, object_storage, exam_pdf_text_repo)  # type: ignore[reportCallIssue]

        service.upload_pdf(_make_user(), _make_course(), "exam.pdf", b"%PDF-1.7")

        # Ensure text was persisted
        assert exam_pdf_text_repo.create.called
        created_arg = exam_pdf_text_repo.create.call_args.args[0]
        assert "typed extracted content" in created_arg.extracted_text


    def test_ocr_fallback_persists_text_when_typed_empty(monkeypatch) -> None:
        """When typed extraction is empty, OCR fallback should run and be persisted."""
        upload_repo = MagicMock()
        upload_repo.create.return_value = _make_upload_record()
        membership_repo = MagicMock()
        membership_repo.get_by_user_and_course.return_value = _make_membership()
        object_storage = MagicMock()
        exam_pdf_text_repo = MagicMock()

        # Mock pdfminer to return empty string
        pdfminer_mod: Any = ModuleType("pdfminer.high_level")
        pdfminer_mod.extract_text = lambda fp: ""
        sys.modules["pdfminer.high_level"] = pdfminer_mod

        # Mock pdf2image.convert_from_bytes to return a list of fake images
        pdf2image_mod: Any = ModuleType("pdf2image")
        pdf2image_mod.convert_from_bytes = lambda b: [object(), object()]
        sys.modules["pdf2image"] = pdf2image_mod

        # Mock pytesseract.image_to_string to return OCR text for each image
        pytesseract_mod: Any = ModuleType("pytesseract")
        pytesseract_mod.image_to_string = lambda img: "ocr extracted"
        sys.modules["pytesseract"] = pytesseract_mod

        service = ExamPdfService(upload_repo, membership_repo, object_storage, exam_pdf_text_repo)  # type: ignore[reportCallIssue]

        service.upload_pdf(_make_user(), _make_course(), "exam.pdf", b"%PDF-1.7")

        assert exam_pdf_text_repo.create.called
        created_arg = exam_pdf_text_repo.create.call_args.args[0]
        assert "ocr extracted" in created_arg.extracted_text


    def test_extraction_failures_do_not_prevent_upload(monkeypatch) -> None:
        """If extraction raises, upload should still succeed and no text persisted."""
        upload_repo = MagicMock()
        upload_repo.create.return_value = _make_upload_record()
        membership_repo = MagicMock()
        membership_repo.get_by_user_and_course.return_value = _make_membership()
        object_storage = MagicMock()
        exam_pdf_text_repo = MagicMock()

        # Make pdfminer raise ImportError and pytesseract import fail
        if "pdfminer.high_level" in sys.modules:
            del sys.modules["pdfminer.high_level"]
        sys.modules["pdfminer"] = ModuleType("pdfminer")

        if "pytesseract" in sys.modules:
            del sys.modules["pytesseract"]

        service = ExamPdfService(upload_repo, membership_repo, object_storage, exam_pdf_text_repo)  # type: ignore[reportCallIssue]

        service.upload_pdf(_make_user(), _make_course(), "exam.pdf", b"%PDF-1.7")

        # Upload record was created, but no extracted text persisted
        assert upload_repo.create.called
        assert not exam_pdf_text_repo.create.called
