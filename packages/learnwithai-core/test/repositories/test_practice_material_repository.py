"""Tests for PracticeMaterialRepository."""

from __future__ import annotations

from unittest.mock import MagicMock

from learnwithai.repositories.practice_material_repository import PracticeMaterialRepository
from learnwithai.tables.practice_material import PracticeMaterial


def test_model_type_returns_practice_material() -> None:
    repo = PracticeMaterialRepository(MagicMock())

    assert repo.model_type is PracticeMaterial


def test_get_by_upload_id_returns_result_from_session() -> None:
    session = MagicMock()
    expected = MagicMock(spec=PracticeMaterial)
    session.exec.return_value.first.return_value = expected
    repo = PracticeMaterialRepository(session)

    result = repo.get_by_upload_id(42)

    assert result is expected
    session.exec.assert_called_once()


def test_get_by_upload_id_returns_none_when_not_found() -> None:
    session = MagicMock()
    session.exec.return_value.first.return_value = None
    repo = PracticeMaterialRepository(session)

    result = repo.get_by_upload_id(999)

    assert result is None


def test_list_by_student_and_course_returns_results() -> None:
    session = MagicMock()
    expected = [MagicMock(spec=PracticeMaterial), MagicMock(spec=PracticeMaterial)]
    session.exec.return_value.all.return_value = expected
    repo = PracticeMaterialRepository(session)

    result = repo.list_by_student_and_course(student_pid=123, course_id=5)

    assert result == expected
    session.exec.assert_called_once()


def test_list_by_student_and_course_returns_empty_list_when_none_found() -> None:
    session = MagicMock()
    session.exec.return_value.all.return_value = []
    repo = PracticeMaterialRepository(session)

    result = repo.list_by_student_and_course(student_pid=123, course_id=5)

    assert result == []
