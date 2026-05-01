"""Typed models for practice material generation outputs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..interfaces import TrackedJob

DifficultyLabel = Literal["easy", "medium", "hard"]

PRACTICE_MATERIAL_KIND = "practice_material"


class PracticeMaterialJob(TrackedJob):
    """Dramatiq job payload for practice material generation."""

    type: Literal["practice_material"] = "practice_material"


class PracticeQuestion(BaseModel):
    """A single practice question with its correct answer and topic metadata."""

    question_text: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    difficulty: DifficultyLabel = "medium"


class Flashcard(BaseModel):
    """A flashcard with a prompt on the front and explanation on the back."""

    front: str = Field(min_length=1)
    back: str = Field(min_length=1)
    topic: str = Field(min_length=1)


class PracticeMaterialSet(BaseModel):
    """A complete set of AI-generated practice materials targeting a student's weak topics."""

    model_config = ConfigDict(extra="ignore")

    upload_id: int
    weak_topics: list[str] = Field(min_length=1)
    questions: list[PracticeQuestion] = Field(min_length=1)
    flashcards: list[Flashcard] = Field(min_length=1)


class PracticeMaterialJobInput(BaseModel):
    """Input payload for the practice material generation background job."""

    upload_id: int
    student_pid: int
    course_id: int
