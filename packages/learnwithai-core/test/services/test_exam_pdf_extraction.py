from __future__ import annotations

import sys
from datetime import datetime, timezone
from types import ModuleType
from typing import Any
from unittest.mock import MagicMock, patch

from learnwithai.services.exam_pdf_service import ExamPdfService
from learnwithai.tables.course import Course, Term
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
from learnwithai.tables.membership import MembershipState
from learnwithai.tables.user import User

# ---------- Helpers ----------


def _make_user() -> User:
    u = MagicMock(spec=User)
    u.pid = 123
    return u  # type: ignore


def _make_course() -> Course:
    c = MagicMock(spec=Course)
    c.id = 1
    c.term = Term.FALL
    c.year = 2026
    return c  # type: ignore


def _make_membership():
    m = MagicMock()
    m.state = MembershipState.ENROLLED
    return m


def _upload_with_id(id_val: int | None = 22) -> ExamPdfUpload:
    return ExamPdfUpload(
        id=id_val,
        course_id=1,
        uploader_pid=123,
        storage_key="key",
        original_filename="exam.pdf",
        content_type="application/pdf",
        size_bytes=100,
        created_at=datetime.now(timezone.utc),
    )


def _setup(upload_id: int | None = 22):
    upload_repo = MagicMock()
    upload_repo.create.return_value = _upload_with_id(upload_id)

    membership_repo = MagicMock()
    membership_repo.get_by_user_and_course.return_value = _make_membership()

    object_storage = MagicMock()
    text_repo = MagicMock()
    analysis_service = MagicMock()

    service = ExamPdfService(upload_repo, membership_repo, object_storage, text_repo, analysis_service)
    return service, text_repo


def mock_import(typed=None, ocr=None):
    def _mock(name: str):
        if name == "pdfminer.high_level":
            if isinstance(typed, Exception):
                raise typed
            if typed is None:
                raise ImportError
            m = MagicMock()
            m.extract_text.return_value = typed
            return m

        if name == "pdf2image":
            if ocr is None:
                raise ImportError
            m = MagicMock()
            m.convert_from_bytes.return_value = [object()]
            return m

        if name == "pytesseract":
            if isinstance(ocr, Exception):
                raise ocr
            if ocr is None:
                raise ImportError
            m = MagicMock()
            m.image_to_string.return_value = ocr
            return m

        raise ImportError

    return _mock


# ---------- Tests ----------


def test_typed_extraction_success():
    service, repo = _setup()

    with patch("importlib.import_module", side_effect=mock_import(typed="full text")):
        service.upload_pdf(_make_user(), _make_course(), "f.pdf", b"%PDF")

    assert "full text" in repo.create.call_args.args[0].extracted_text


def test_short_text_triggers_ocr_and_appends():
    service, repo = _setup()

    with patch("importlib.import_module", side_effect=mock_import(typed="short", ocr="ocr text")):
        service.upload_pdf(_make_user(), _make_course(), "f.pdf", b"%PDF")

    result = repo.create.call_args.args[0].extracted_text
    assert "short" in result and "ocr text" in result


def test_ocr_empty_hits_else_branch():
    service, repo = _setup()

    with patch("importlib.import_module", side_effect=mock_import(typed="short", ocr="")):
        service.upload_pdf(_make_user(), _make_course(), "f.pdf", b"%PDF")

    result = repo.create.call_args.args[0].extracted_text.strip()
    assert result == "short"


def test_pdfminer_failure_triggers_ocr():
    service, repo = _setup()

    with patch("importlib.import_module", side_effect=mock_import(typed=ImportError(), ocr="ocr text")):
        service.upload_pdf(_make_user(), _make_course(), "f.pdf", b"%PDF")

    assert "ocr text" in repo.create.call_args.args[0].extracted_text


def test_ocr_failure_and_empty_still_persists_fallback_analysis():
    service, repo = _setup()

    with patch("importlib.import_module", side_effect=mock_import(typed="", ocr=Exception("fail"))):
        upload = service.upload_pdf(_make_user(), _make_course(), "f.pdf", b"%PDF")

    repo.create.assert_not_called()

    analysis_mock = service._exam_analysis_service.analyze_from_text
    assert isinstance(analysis_mock, MagicMock)
    analysis_mock.assert_called_once_with("")

    update_mock = service._exam_pdf_upload_repo.update
    assert isinstance(update_mock, MagicMock)
    update_mock.assert_called_once_with(upload)

    assert upload.analysis_data is not None


def test_upload_id_none_and_persistence_exception_paths():
    service, repo = _setup(upload_id=None)

    service._extract_text_from_pdf = MagicMock(return_value="valid text")
    repo.create.side_effect = RuntimeError("db fail")

    result = service.upload_pdf(_make_user(), _make_course(), "f.pdf", b"%PDF")

    assert result.id is None
    repo.create.assert_not_called()


def test_extract_text_ocr_runs_when_typed_text_is_short() -> None:
    service = ExamPdfService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

    with patch.object(service, "_extract_text_from_pdf", wraps=service._extract_text_from_pdf):
        sys.modules.pop("pdfminer.high_level", None)
        sys.modules.pop("pytesseract", None)
        sys.modules.pop("pdf2image", None)

        pdfminer_mod: Any = ModuleType("pdfminer.high_level")
        pdfminer_mod.extract_text = lambda fp: ""
        sys.modules["pdfminer.high_level"] = pdfminer_mod

        pdf2image_mod: Any = ModuleType("pdf2image")
        pdf2image_mod.convert_from_bytes = lambda b: [object()]
        sys.modules["pdf2image"] = pdf2image_mod

        pytesseract_mod: Any = ModuleType("pytesseract")
        pytesseract_mod.image_to_string = lambda img: "ocr extracted text"
        sys.modules["pytesseract"] = pytesseract_mod

        result = service._extract_text_from_pdf(b"%PDF-1.7")

    assert result == "ocr extracted text"


def test_extract_text_ocr_skipped_when_typed_text_is_long() -> None:
    service = ExamPdfService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

    sys.modules.pop("pdfminer.high_level", None)
    pdfminer_mod: Any = ModuleType("pdfminer.high_level")
    pdfminer_mod.extract_text = lambda fp: "a" * 100
    sys.modules["pdfminer.high_level"] = pdfminer_mod

    result = service._extract_text_from_pdf(b"%PDF-1.7")

    assert result == "a" * 100


def test_extract_text_returns_empty_when_ocr_yields_whitespace() -> None:
    service = ExamPdfService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

    sys.modules.pop("pdfminer.high_level", None)
    sys.modules.pop("pytesseract", None)
    sys.modules.pop("pdf2image", None)

    pdfminer_mod: Any = ModuleType("pdfminer.high_level")
    pdfminer_mod.extract_text = lambda fp: ""
    sys.modules["pdfminer.high_level"] = pdfminer_mod

    pdf2image_mod: Any = ModuleType("pdf2image")
    pdf2image_mod.convert_from_bytes = lambda b: [object()]
    sys.modules["pdf2image"] = pdf2image_mod

    pytesseract_mod: Any = ModuleType("pytesseract")
    pytesseract_mod.image_to_string = lambda img: "   "
    sys.modules["pytesseract"] = pytesseract_mod

    result = service._extract_text_from_pdf(b"%PDF-1.7")

    assert result == ""


def test_extract_text_returns_empty_when_ocr_deps_unavailable() -> None:
    service = ExamPdfService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

    sys.modules.pop("pdfminer.high_level", None)
    sys.modules.pop("pytesseract", None)
    sys.modules.pop("pdf2image", None)

    pdfminer_mod: Any = ModuleType("pdfminer.high_level")
    pdfminer_mod.extract_text = lambda fp: ""
    sys.modules["pdfminer.high_level"] = pdfminer_mod

    result = service._extract_text_from_pdf(b"%PDF-1.7")

    assert result == ""


def test_upload_persists_analysis_data_when_analysis_succeeds() -> None:
    upload_repo = MagicMock()
    upload_repo.create.return_value = _upload_with_id(22)

    membership_repo = MagicMock()
    membership_repo.get_by_user_and_course.return_value = _make_membership()

    object_storage = MagicMock()
    text_repo = MagicMock()

    analysis_service = MagicMock()
    analysis_service.analyze_from_text.return_value = MagicMock(
        model_dump=MagicMock(return_value={"strengths": ["Algebra"]})
    )

    service = ExamPdfService(upload_repo, membership_repo, object_storage, text_repo, analysis_service)
    service._extract_text_from_pdf = MagicMock(return_value="Question 1: ...")

    upload = service.upload_pdf(_make_user(), _make_course(), "exam.pdf", b"%PDF")

    assert upload.analysis_data == {"strengths": ["Algebra"]}
    upload_repo.update.assert_called_once_with(upload)


def test_upload_still_succeeds_when_analysis_fails() -> None:
    upload_repo = MagicMock()
    upload_repo.create.return_value = _upload_with_id(22)

    membership_repo = MagicMock()
    membership_repo.get_by_user_and_course.return_value = _make_membership()

    object_storage = MagicMock()
    text_repo = MagicMock()

    analysis_service = MagicMock()
    analysis_service.analyze_from_text.side_effect = RuntimeError("analysis failed")

    service = ExamPdfService(upload_repo, membership_repo, object_storage, text_repo, analysis_service)
    service._extract_text_from_pdf = MagicMock(return_value="Question 1: ...")

    upload = service.upload_pdf(_make_user(), _make_course(), "exam.pdf", b"%PDF")

    assert upload.id == 22
    assert upload.analysis_data is None
    upload_repo.update.assert_not_called()
