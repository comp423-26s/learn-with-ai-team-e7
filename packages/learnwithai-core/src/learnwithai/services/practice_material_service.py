"""Practice material generation service for exam-based revision sets."""

from __future__ import annotations

import json
import re

from pydantic import ValidationError

from ..models.practice_material import DifficultyLabel, Flashcard, PracticeMaterialSet, PracticeQuestion
from ..repositories.exam_pdf_text_repository import ExamPdfTextRepository
from ..repositories.exam_pdf_upload_repository import ExamPdfUploadRepository
from ..repositories.practice_material_repository import PracticeMaterialRepository
from ..tables.exam_pdf_upload import ExamPdfUpload
from ..tables.practice_material import PracticeMaterial
from .ai_completion_service import AiCompletionService


class PracticeMaterialService:
    """Builds practice questions and flashcards from exam analysis data."""

    def __init__(
        self,
        ai_completion_service: AiCompletionService,
        exam_pdf_upload_repo: ExamPdfUploadRepository,
        exam_pdf_text_repo: ExamPdfTextRepository,
        practice_material_repo: PracticeMaterialRepository,
    ) -> None:
        """Initializes dependencies for AI-backed practice material generation.

        Args:
            ai_completion_service: Wrapper around the OpenAI chat completion API.
            exam_pdf_upload_repo: Repository used to load exam upload metadata.
            exam_pdf_text_repo: Repository used to load extracted exam text.
            practice_material_repo: Repository used to persist generated materials.
        """
        self._ai_completion_service = ai_completion_service
        self._exam_pdf_upload_repo = exam_pdf_upload_repo
        self._exam_pdf_text_repo = exam_pdf_text_repo
        self._practice_material_repo = practice_material_repo

    def generate_materials(self, upload_id: int, student_pid: int, course_id: int) -> PracticeMaterial:
        """Generates and persists practice materials for one exam upload.

        Args:
            upload_id: Identifier of the uploaded exam PDF.
            student_pid: PID of the student who uploaded the exam.
            course_id: Identifier of the course that owns the upload.

        Returns:
            The persisted practice material record.

        Raises:
            ValueError: If the upload does not exist.
        """
        upload = self._exam_pdf_upload_repo.get_by_id(upload_id)
        if upload is None:
            raise ValueError("Exam PDF upload not found")

        weak_topics = self._weak_topics_from_upload(upload)
        extracted = self._exam_pdf_text_repo.get_by_upload_id(upload_id)
        exam_text = extracted.extracted_text if extracted is not None else ""

        llm_response = self._ai_completion_service.complete(
            system_prompt=self._system_prompt(),
            user_prompt=self._user_prompt(weak_topics, exam_text),
        )
        parsed = self._parse_llm_response(llm_response, upload_id)
        if parsed is None:
            parsed = self._fallback_material_set(upload_id, weak_topics, exam_text)

        existing = self._practice_material_repo.get_by_upload_id(upload_id)
        material = PracticeMaterial(
            id=existing.id if existing is not None else None,
            upload_id=upload_id,
            student_pid=student_pid,
            course_id=course_id,
            material_data=parsed.model_dump(),
        )
        if existing is None:
            return self._practice_material_repo.create(material)
        return self._practice_material_repo.update(material)

    def _system_prompt(self) -> str:
        return (
            "You are a revision-material generator. "
            "Return ONLY valid JSON with no markdown. "
            "Use the provided weak topics and the actual exam text to create exactly 5 practice questions "
            "and 5 flashcards per weak topic. "
            "Keep every item grounded in the exam content and avoid introducing unrelated topics. "
            "Use the weak topic names exactly as provided."
        )

    def _user_prompt(self, weak_topics: list[str], exam_text: str) -> str:
        payload = {
            "exam_text": exam_text,
            "weak_topics": weak_topics,
            "required_schema": {
                "upload_id": "integer",
                "weak_topics": ["string"],
                "questions": [
                    {
                        "question_text": "string",
                        "answer": "string",
                        "topic": "string",
                        "difficulty": "easy|medium|hard",
                    }
                ],
                "flashcards": [
                    {
                        "front": "string",
                        "back": "string",
                        "topic": "string",
                    }
                ],
            },
        }
        return json.dumps(payload)

    def _parse_llm_response(self, raw_response: str, upload_id: int) -> PracticeMaterialSet | None:
        json_payload = self._extract_json_object(raw_response)
        if json_payload is None:
            return None

        try:
            parsed = PracticeMaterialSet.model_validate_json(json_payload)
        except ValidationError:
            return None

        if parsed.upload_id != upload_id:
            return None
        return parsed

    def _extract_json_object(self, text: str) -> str | None:
        stripped = text.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            return stripped

        match = re.search(r"\{.*\}", stripped, flags=re.DOTALL)
        if match is None:
            return None
        return match.group(0)

    def _fallback_material_set(
        self,
        upload_id: int,
        weak_topics: list[str],
        exam_text: str,
    ) -> PracticeMaterialSet:
        topics = self._normalized_topics(weak_topics)
        exam_excerpt = self._exam_excerpt(exam_text)

        questions: list[PracticeQuestion] = []
        flashcards: list[Flashcard] = []

        for topic in topics:
            for index in range(5):
                questions.append(
                    PracticeQuestion(
                        question_text=self._fallback_question_text(topic, index, exam_excerpt),
                        answer=self._fallback_question_answer(topic, exam_excerpt),
                        topic=topic,
                        difficulty=self._difficulty_for_index(index),
                    )
                )
                flashcards.append(
                    Flashcard(
                        front=self._fallback_flashcard_front(topic, index, exam_excerpt),
                        back=self._fallback_flashcard_back(topic, exam_excerpt),
                        topic=topic,
                    )
                )

        return PracticeMaterialSet(
            upload_id=upload_id,
            weak_topics=topics,
            questions=questions,
            flashcards=flashcards,
        )

    def _weak_topics_from_upload(self, upload: ExamPdfUpload) -> list[str]:
        analysis_data = upload.analysis_data or {}
        topics: list[str] = []

        for key in ("weaknesses", "needs_review"):
            values = analysis_data.get(key, [])
            if isinstance(values, list):
                topics.extend(value for value in values if isinstance(value, str) and value.strip())

        return self._normalized_topics(topics)

    def _normalized_topics(self, topics: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for topic in topics:
            cleaned = topic.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            normalized.append(cleaned)

        if normalized:
            return normalized
        return ["General Review"]

    def _exam_excerpt(self, exam_text: str) -> str:
        words = exam_text.split()
        if not words:
            return "the exam content"
        return " ".join(words[:18])

    def _difficulty_for_index(self, index: int) -> DifficultyLabel:
        if index < 2:
            return "easy"
        if index < 4:
            return "medium"
        return "hard"

    def _fallback_question_text(self, topic: str, index: int, exam_excerpt: str) -> str:
        number = index + 1
        return f"{topic} practice question {number}: Apply the exam idea from {exam_excerpt}."

    def _fallback_question_answer(self, topic: str, exam_excerpt: str) -> str:
        return f"Review the exam's {topic.lower()} content and explain how it connects to {exam_excerpt}."

    def _fallback_flashcard_front(self, topic: str, index: int, exam_excerpt: str) -> str:
        number = index + 1
        return f"{topic} flashcard {number}: What should you remember from {exam_excerpt}?"

    def _fallback_flashcard_back(self, topic: str, exam_excerpt: str) -> str:
        return f"Focus on {topic.lower()} in the context of {exam_excerpt}."
