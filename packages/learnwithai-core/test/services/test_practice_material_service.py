"""Tests for PracticeMaterialService."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from learnwithai.models.practice_material import Flashcard, PracticeMaterialSet, PracticeQuestion
from learnwithai.repositories.exam_pdf_text_repository import ExamPdfTextRepository
from learnwithai.repositories.exam_pdf_upload_repository import ExamPdfUploadRepository
from learnwithai.repositories.practice_material_repository import PracticeMaterialRepository
from learnwithai.services.practice_material_service import PracticeMaterialService
from learnwithai.tables.exam_pdf_text import ExamPdfText
from learnwithai.tables.exam_pdf_upload import ExamPdfUpload
from learnwithai.tables.practice_material import PracticeMaterial


def _make_upload() -> ExamPdfUpload:
    upload = ExamPdfUpload(
        id=22,
        course_id=5,
        uploader_pid=123456789,
        storage_key="courses/5/exam-pdfs/123/upload.pdf",
        original_filename="upload.pdf",
        content_type="application/pdf",
        size_bytes=128,
        created_at=datetime.now(timezone.utc),
    )
    upload.analysis_data = {
        "weaknesses": ["Recursion"],
        "needs_review": ["Trees"],
    }
    return upload


def _make_text() -> ExamPdfText:
    return ExamPdfText(
        id=11,
        upload_id=22,
        extracted_text="Recursion and tree traversal appear throughout the exam instructions and question prompts.",
        extracted_at=datetime.now(timezone.utc),
    )


def _build_service() -> tuple[MagicMock, MagicMock, MagicMock, MagicMock, PracticeMaterialService]:
    ai_completion = MagicMock()
    exam_upload_repo = MagicMock(spec=ExamPdfUploadRepository)
    exam_text_repo = MagicMock(spec=ExamPdfTextRepository)
    practice_material_repo = MagicMock(spec=PracticeMaterialRepository)
    service = PracticeMaterialService(ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo)
    return ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service


def test_generate_materials_returns_persisted_material_for_valid_json() -> None:
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    upload = _make_upload()
    text = _make_text()
    payload = PracticeMaterialSet(
        upload_id=22,
        weak_topics=["Recursion", "Trees"],
        questions=[
            PracticeQuestion(
                question_text="How do recursive calls reduce a problem?",
                answer="They break it into smaller subproblems.",
                topic="Recursion",
                difficulty="medium",
            ),
            PracticeQuestion(
                question_text="Trace a simple recursive base case.",
                answer="A base case stops the recursion.",
                topic="Recursion",
                difficulty="easy",
            ),
            PracticeQuestion(
                question_text="Describe how recursion unwinds.",
                answer="The call stack resolves from the base case upward.",
                topic="Recursion",
                difficulty="hard",
            ),
            PracticeQuestion(
                question_text="Identify a recursive tree traversal order.",
                answer="Use preorder, inorder, or postorder consistently.",
                topic="Trees",
                difficulty="medium",
            ),
            PracticeQuestion(
                question_text="Explain the root node's role in traversal.",
                answer="It anchors the recursive structure.",
                topic="Trees",
                difficulty="hard",
            ),
            PracticeQuestion(
                question_text="What makes a recursive solution elegant?",
                answer="A clear base case and shrinking subproblem.",
                topic="Recursion",
                difficulty="easy",
            ),
            PracticeQuestion(
                question_text="When should a tree algorithm recurse?",
                answer="When each subtree can be handled independently.",
                topic="Trees",
                difficulty="medium",
            ),
            PracticeQuestion(
                question_text="How does recursion affect the call stack?",
                answer="Each call adds a stack frame until the base case.",
                topic="Recursion",
                difficulty="hard",
            ),
            PracticeQuestion(
                question_text="What is a leaf node?",
                answer="A node with no children.",
                topic="Trees",
                difficulty="easy",
            ),
            PracticeQuestion(
                question_text="How do you verify recursive correctness?",
                answer="Check the base case and inductive step.",
                topic="Recursion",
                difficulty="medium",
            ),
        ],
        flashcards=[
            Flashcard(front="Recursion: base case?", back="The stopping condition.", topic="Recursion"),
            Flashcard(front="Recursion: shrinking step?", back="A smaller subproblem.", topic="Recursion"),
            Flashcard(front="Recursion: call stack?", back="Frames accumulate until unwinding.", topic="Recursion"),
            Flashcard(front="Recursion: correctness?", back="Base case plus inductive step.", topic="Recursion"),
            Flashcard(front="Recursion: common risk?", back="Missing base case.", topic="Recursion"),
            Flashcard(front="Trees: root?", back="The top node of the structure.", topic="Trees"),
            Flashcard(front="Trees: leaf?", back="A node without children.", topic="Trees"),
            Flashcard(front="Trees: traversal?", back="A systematic node visitation order.", topic="Trees"),
            Flashcard(front="Trees: subtree?", back="A node and all of its descendants.", topic="Trees"),
            Flashcard(front="Trees: recursion?", back="Each node can be processed similarly.", topic="Trees"),
        ],
    )
    ai_completion.complete.return_value = json.dumps(payload.model_dump())
    exam_upload_repo.get_by_id.return_value = upload
    exam_text_repo.get_by_upload_id.return_value = text
    practice_material_repo.get_by_upload_id.return_value = None
    created = PracticeMaterial(
        id=99,
        upload_id=22,
        student_pid=123456789,
        course_id=5,
        material_data=payload.model_dump(),
        generated_at=datetime.now(timezone.utc),
    )
    practice_material_repo.create.return_value = created

    result = service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    assert result is created
    ai_completion.complete.assert_called_once()
    prompt = ai_completion.complete.call_args.kwargs["user_prompt"]
    assert "Recursion" in prompt
    assert "tree traversal" in prompt
    created_material = practice_material_repo.create.call_args.args[0]
    assert created_material.upload_id == 22
    assert created_material.student_pid == 123456789
    assert created_material.course_id == 5
    assert created_material.material_data == payload.model_dump()


def test_generate_materials_updates_existing_material_when_present() -> None:
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    upload = _make_upload()
    exam_upload_repo.get_by_id.return_value = upload
    exam_text_repo.get_by_upload_id.return_value = _make_text()
    practice_material_repo.get_by_upload_id.return_value = PracticeMaterial(
        id=77,
        upload_id=22,
        student_pid=123456789,
        course_id=5,
        material_data={"upload_id": 22, "weak_topics": ["Recursion"], "questions": [], "flashcards": []},
        generated_at=datetime.now(timezone.utc),
    )
    practice_material_repo.update.return_value = PracticeMaterial(
        id=77,
        upload_id=22,
        student_pid=123456789,
        course_id=5,
        material_data={"upload_id": 22, "weak_topics": ["Recursion"], "questions": [], "flashcards": []},
        generated_at=datetime.now(timezone.utc),
    )
    ai_completion.complete.return_value = (
        "Result:\n"
        + json.dumps(
            {
                "upload_id": 22,
                "weak_topics": ["Recursion"],
                "questions": [
                    {
                        "question_text": "How do recursive calls reduce a problem?",
                        "answer": "They break it into smaller subproblems.",
                        "topic": "Recursion",
                        "difficulty": "medium",
                    }
                ],
                "flashcards": [
                    {"front": "Recursion: base case?", "back": "The stopping condition.", "topic": "Recursion"}
                ],
            }
        )
        + "\nEnd."
    )

    result = service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    assert result.id == 77
    practice_material_repo.update.assert_called_once()
    updated_material = practice_material_repo.update.call_args.args[0]
    assert updated_material.id == 77
    assert updated_material.material_data["upload_id"] == 22


def test_generate_materials_falls_back_when_llm_response_has_invalid_schema() -> None:
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    exam_upload_repo.get_by_id.return_value = _make_upload()
    exam_text_repo.get_by_upload_id.return_value = _make_text()
    practice_material_repo.get_by_upload_id.return_value = None
    practice_material_repo.create.side_effect = lambda material: material
    ai_completion.complete.return_value = json.dumps(
        {
            "upload_id": 22,
            "weak_topics": ["Recursion"],
            "questions": [
                {
                    "question_text": "Missing answer field",
                    "topic": "Recursion",
                    "difficulty": "medium",
                }
            ],
            "flashcards": [{"front": "Recursion: base case?", "back": "The stopping condition.", "topic": "Recursion"}],
        }
    )

    result = service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    created_material = practice_material_repo.create.call_args.args[0]
    assert result.id == created_material.id
    assert created_material.material_data["weak_topics"] == ["Recursion", "Trees"]
    assert len(created_material.material_data["questions"]) == 10


def test_generate_materials_falls_back_when_llm_response_is_invalid_json() -> None:
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    exam_upload_repo.get_by_id.return_value = _make_upload()
    exam_text_repo.get_by_upload_id.return_value = _make_text()
    exam_completion = "not-json"
    ai_completion.complete.return_value = exam_completion
    practice_material_repo.get_by_upload_id.return_value = None
    practice_material_repo.create.return_value = PracticeMaterial(
        id=100,
        upload_id=22,
        student_pid=123456789,
        course_id=5,
        material_data={},
        generated_at=datetime.now(timezone.utc),
    )

    result = service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    created_material = practice_material_repo.create.call_args.args[0]
    assert result.id == 100
    assert created_material.material_data["weak_topics"] == ["Recursion", "Trees"]
    assert len(created_material.material_data["questions"]) == 10
    assert len(created_material.material_data["flashcards"]) == 10
    assert created_material.material_data["questions"][0]["topic"] == "Recursion"
    assert "Recursion and tree traversal" in created_material.material_data["questions"][0]["question_text"]


def test_generate_materials_falls_back_with_default_topic_and_empty_excerpt() -> None:
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    upload = _make_upload()
    upload.analysis_data = {
        "weaknesses": "Recursion",
        "needs_review": None,
    }
    exam_upload_repo.get_by_id.return_value = upload
    exam_text_repo.get_by_upload_id.return_value = ExamPdfText(
        id=12,
        upload_id=22,
        extracted_text="",
        extracted_at=datetime.now(timezone.utc),
    )
    practice_material_repo.get_by_upload_id.return_value = None
    practice_material_repo.create.side_effect = lambda material: material
    ai_completion.complete.return_value = json.dumps(
        {
            "upload_id": 999,
            "weak_topics": ["Ignored"],
            "questions": [
                {
                    "question_text": "How do recursive calls reduce a problem?",
                    "answer": "They break it into smaller subproblems.",
                    "topic": "Recursion",
                    "difficulty": "medium",
                }
            ],
            "flashcards": [{"front": "Recursion: base case?", "back": "The stopping condition.", "topic": "Recursion"}],
        }
    )

    result = service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    created_material = practice_material_repo.create.call_args.args[0]
    assert result is created_material
    assert created_material.material_data["weak_topics"] == ["General Review"]
    assert created_material.material_data["questions"][0]["question_text"].endswith("the exam content.")


def test_generate_materials_ignores_duplicate_and_blank_topics_during_fallback() -> None:
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    upload = _make_upload()
    upload.analysis_data = {
        "weaknesses": ["Recursion", "", "Recursion"],
        "needs_review": ["Trees", "Trees", " "],
    }
    exam_upload_repo.get_by_id.return_value = upload
    exam_text_repo.get_by_upload_id.return_value = _make_text()
    practice_material_repo.get_by_upload_id.return_value = None
    practice_material_repo.create.side_effect = lambda material: material
    ai_completion.complete.return_value = json.dumps(
        {
            "upload_id": 999,
            "weak_topics": ["Ignored"],
            "questions": [
                {
                    "question_text": "How do recursive calls reduce a problem?",
                    "answer": "They break it into smaller subproblems.",
                    "topic": "Recursion",
                    "difficulty": "medium",
                }
            ],
            "flashcards": [{"front": "Recursion: base case?", "back": "The stopping condition.", "topic": "Recursion"}],
        }
    )

    result = service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    created_material = practice_material_repo.create.call_args.args[0]
    assert result is created_material
    assert created_material.material_data["weak_topics"] == ["Recursion", "Trees"]
    assert len(created_material.material_data["questions"]) == 10


def test_generate_materials_raises_for_missing_upload() -> None:
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    exam_upload_repo.get_by_id.return_value = None

    with pytest.raises(ValueError, match="Exam PDF upload not found"):
        service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    ai_completion.complete.assert_not_called()
    exam_text_repo.get_by_upload_id.assert_not_called()
    practice_material_repo.get_by_upload_id.assert_not_called()


def test_generate_materials_falls_back_when_extracted_json_is_malformed() -> None:
    """LLM returns text whose braced substring is not valid JSON; covers the JSON-decode
    error branch and the middle-regex path inside _extract_json_object."""
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    exam_upload_repo.get_by_id.return_value = _make_upload()
    exam_text_repo.get_by_upload_id.return_value = _make_text()
    practice_material_repo.get_by_upload_id.return_value = None
    practice_material_repo.create.side_effect = lambda material: material
    # The braced substring looks like JSON to the regex but is not parseable.
    ai_completion.complete.return_value = "Here is your result: {not valid json at all} done."

    result = service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    created_material = practice_material_repo.create.call_args.args[0]
    assert result is created_material
    assert created_material.material_data["weak_topics"] == ["Recursion", "Trees"]
    assert len(created_material.material_data["questions"]) == 10


def test_generate_materials_falls_back_when_parsed_json_is_not_a_dict() -> None:
    """LLM response parses to a JSON non-dict (e.g. list); covers the isinstance guard."""
    ai_completion, exam_upload_repo, exam_text_repo, practice_material_repo, service = _build_service()
    exam_upload_repo.get_by_id.return_value = _make_upload()
    exam_text_repo.get_by_upload_id.return_value = _make_text()
    practice_material_repo.get_by_upload_id.return_value = None
    practice_material_repo.create.side_effect = lambda material: material
    ai_completion.complete.return_value = '{"fake": "json"}'

    with patch("learnwithai.services.practice_material_service.json.loads", return_value=[1, 2, 3]):
        result = service.generate_materials(upload_id=22, student_pid=123456789, course_id=5)

    created_material = practice_material_repo.create.call_args.args[0]
    assert result is created_material
    assert created_material.material_data["weak_topics"] == ["Recursion", "Trees"]
    assert len(created_material.material_data["questions"]) == 10
