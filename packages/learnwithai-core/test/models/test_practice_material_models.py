"""Tests for practice material Pydantic models."""

import pytest
from learnwithai.models.practice_material import (
    PRACTICE_MATERIAL_KIND,
    Flashcard,
    PracticeMaterialJobInput,
    PracticeMaterialSet,
    PracticeQuestion,
)
from pydantic import ValidationError


def test_practice_material_kind_constant() -> None:
    assert PRACTICE_MATERIAL_KIND == "practice_material"


def test_practice_question_round_trips() -> None:
    model = PracticeQuestion(
        question_text="What is Big-O notation?",
        answer="A mathematical notation describing algorithm complexity",
        topic="Big-O Analysis",
        difficulty="medium",
    )
    restored = PracticeQuestion.model_validate(model.model_dump())
    assert restored.question_text == model.question_text
    assert restored.answer == model.answer
    assert restored.topic == model.topic
    assert restored.difficulty == model.difficulty


def test_practice_question_default_difficulty() -> None:
    model = PracticeQuestion(
        question_text="What is a pointer?",
        answer="A variable that stores a memory address",
        topic="Pointers",
    )
    assert model.difficulty == "medium"


def test_practice_question_rejects_empty_question_text() -> None:
    with pytest.raises(ValidationError):
        PracticeQuestion(question_text="", answer="An answer", topic="Topic")


def test_practice_question_rejects_empty_answer() -> None:
    with pytest.raises(ValidationError):
        PracticeQuestion(question_text="A question?", answer="", topic="Topic")


def test_practice_question_rejects_empty_topic() -> None:
    with pytest.raises(ValidationError):
        PracticeQuestion(question_text="A question?", answer="An answer", topic="")


def test_flashcard_round_trips() -> None:
    model = Flashcard(
        front="What is recursion?",
        back="A function that calls itself",
        topic="Recursion",
    )
    restored = Flashcard.model_validate(model.model_dump())
    assert restored.front == model.front
    assert restored.back == model.back
    assert restored.topic == model.topic


def test_flashcard_rejects_empty_front() -> None:
    with pytest.raises(ValidationError):
        Flashcard(front="", back="Some back", topic="Topic")


def test_flashcard_rejects_empty_back() -> None:
    with pytest.raises(ValidationError):
        Flashcard(front="Some front", back="", topic="Topic")


def test_flashcard_rejects_empty_topic() -> None:
    with pytest.raises(ValidationError):
        Flashcard(front="Some front", back="Some back", topic="")


def test_practice_material_set_round_trips() -> None:
    question = PracticeQuestion(
        question_text="What is Big-O?",
        answer="Algorithm complexity notation",
        topic="Big-O Analysis",
        difficulty="easy",
    )
    flashcard = Flashcard(
        front="What is recursion?",
        back="A function that calls itself",
        topic="Recursion",
    )
    model = PracticeMaterialSet(
        upload_id=1,
        weak_topics=["Recursion", "Big-O Analysis"],
        questions=[question],
        flashcards=[flashcard],
    )
    restored = PracticeMaterialSet.model_validate(model.model_dump())
    assert restored.upload_id == 1
    assert restored.weak_topics == ["Recursion", "Big-O Analysis"]
    assert len(restored.questions) == 1
    assert len(restored.flashcards) == 1


def test_practice_material_set_ignores_extra_fields() -> None:
    """Extra fields are now ignored to allow LLM responses with metadata."""
    model = PracticeMaterialSet.model_validate(
        {
            "upload_id": 1,
            "weak_topics": ["T"],
            "questions": [{"question_text": "Q?", "answer": "A", "topic": "T", "difficulty": "medium"}],
            "flashcards": [{"front": "F", "back": "B", "topic": "T"}],
            "unexpected_field": "oops",
            "metadata": {"source": "llm"},
        }
    )
    assert model.upload_id == 1
    assert len(model.weak_topics) == 1


def test_practice_material_set_rejects_empty_questions() -> None:
    flashcard = Flashcard(front="F", back="B", topic="T")
    with pytest.raises(ValidationError):
        PracticeMaterialSet(
            upload_id=1,
            weak_topics=["T"],
            questions=[],
            flashcards=[flashcard],
        )


def test_practice_material_set_rejects_empty_flashcards() -> None:
    question = PracticeQuestion(question_text="Q?", answer="A", topic="T")
    with pytest.raises(ValidationError):
        PracticeMaterialSet(
            upload_id=1,
            weak_topics=["T"],
            questions=[question],
            flashcards=[],
        )


def test_practice_material_set_rejects_empty_weak_topics() -> None:
    question = PracticeQuestion(question_text="Q?", answer="A", topic="T")
    flashcard = Flashcard(front="F", back="B", topic="T")
    with pytest.raises(ValidationError):
        PracticeMaterialSet(
            upload_id=1,
            weak_topics=[],
            questions=[question],
            flashcards=[flashcard],
        )


def test_practice_material_job_input_round_trips() -> None:
    model = PracticeMaterialJobInput(upload_id=1, student_pid=123, course_id=5)
    restored = PracticeMaterialJobInput.model_validate(model.model_dump())
    assert restored.upload_id == 1
    assert restored.student_pid == 123
    assert restored.course_id == 5
