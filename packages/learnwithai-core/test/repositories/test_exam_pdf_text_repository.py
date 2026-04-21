"""Tests for ExamPdfTextRepository."""

from __future__ import annotations

from unittest.mock import MagicMock

from learnwithai.repositories.exam_pdf_text_repository import ExamPdfTextRepository
from learnwithai.tables.exam_pdf_text import ExamPdfText


def test_model_type_returns_exam_pdf_text() -> None:
    repo = ExamPdfTextRepository(MagicMock())

    assert repo.model_type is ExamPdfText


def test_get_by_upload_id_returns_result_from_session() -> None:
    session = MagicMock()
    expected = MagicMock(spec=ExamPdfText)
    session.exec.return_value.first.return_value = expected
    repo = ExamPdfTextRepository(session)

    result = repo.get_by_upload_id(42)

    assert result is expected
    session.exec.assert_called_once()


def test_get_by_upload_id_returns_none_when_not_found() -> None:
    session = MagicMock()
    session.exec.return_value.first.return_value = None
    repo = ExamPdfTextRepository(session)

    result = repo.get_by_upload_id(999)

    assert result is None
