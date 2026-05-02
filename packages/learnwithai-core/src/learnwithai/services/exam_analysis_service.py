"""Exam analysis service for topic inference and performance labeling."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from statistics import mean

from pydantic import ValidationError

from ..models.exam_analysis import (
    ExamAnalysisSummary,
    ExamPerformanceAnalysis,
    PerformanceLabel,
    QuestionPerformanceInput,
    QuestionTopicMapping,
    TopicPerformanceSummary,
    TopicSummaryLine,
)
from ..repositories.exam_pdf_text_repository import ExamPdfTextRepository
from .ai_completion_service import AiCompletionService


class ExamAnalysisService:
    """Builds structured topic and performance analysis for exam results."""

    def __init__(
        self,
        ai_completion_service: AiCompletionService,
        exam_pdf_text_repo: ExamPdfTextRepository,
    ) -> None:
        """Initializes dependencies for LLM-backed exam analysis.

        Args:
            ai_completion_service: Wrapper around the OpenAI chat completion API.
            exam_pdf_text_repo: Repository used to load extracted exam PDF text.
        """
        self._ai_completion_service = ai_completion_service
        self._exam_pdf_text_repo = exam_pdf_text_repo

    def analyze_upload(
        self,
        upload_id: int,
        questions: list[QuestionPerformanceInput],
    ) -> ExamPerformanceAnalysis:
        """Analyzes question performance using extracted text for one upload.

        Args:
            upload_id: Identifier of the uploaded exam PDF.
            questions: Per-question scored results for the learner.

        Returns:
            Structured analysis with topic summaries and performance labels.

        Raises:
            ValueError: If no questions are provided.
        """
        print("DEBUG: Tiffany is here", flush=True)
        extracted = self._exam_pdf_text_repo.get_by_upload_id(upload_id)
        context = extracted.extracted_text if extracted is not None else ""
        return self.analyze_questions(questions, exam_context=context)

    def analyze_questions(
        self,
        questions: list[QuestionPerformanceInput],
        *,
        exam_context: str,
    ) -> ExamPerformanceAnalysis:
        """Analyzes scored questions into topic and performance JSON output.

        Args:
            questions: Per-question scored results for the learner.
            exam_context: Extracted exam text used to improve topic categorization.

        Returns:
            Structured analysis with topic summaries and per-question mappings.

        Raises:
            ValueError: If no questions are provided.
        """
        if not questions:
            raise ValueError("At least one question is required for analysis")

        llm_response = self._ai_completion_service.complete(
            system_prompt=self._system_prompt(),
            user_prompt=self._user_prompt(questions, exam_context),
        )
        parsed = self._parse_llm_response(llm_response, questions)
        if parsed is not None:
            return parsed

        # Fallback keeps the feature functional if model output is invalid JSON.
        return self._build_fallback_analysis(questions)

    def _system_prompt(self) -> str:
        return (
            "You are an exam analysis engine. "
            "Return ONLY valid JSON with no markdown. "
            "Infer exactly 3 to 5 topic categories from the exam context and questions. "
            "Map every question_id to exactly one topic and assign performance labels "
            "using only these values: strong, needs_review, weak. "
            "Use score_earned and score_possible to determine performance."
        )

    def _user_prompt(self, questions: list[QuestionPerformanceInput], exam_context: str) -> str:
        payload = {
            "exam_context": exam_context,
            "questions": [q.model_dump() for q in questions],
            "required_schema": {
                "topic_summaries": [
                    {
                        "topic": "string",
                        "question_ids": ["string"],
                        "average_score_pct": "number between 0 and 1",
                        "performance": "strong|needs_review|weak",
                    }
                ],
                "question_mappings": [
                    {
                        "question_id": "string",
                        "topic": "string",
                        "performance": "strong|needs_review|weak",
                        "score_earned": "number >= 0",
                        "score_possible": "number > 0",
                    }
                ],
                "strengths": ["topic names with strong performance"],
                "weaknesses": ["topic names with weak performance"],
                "needs_review": ["topic names with needs_review performance"],
            },
        }
        return json.dumps(payload)

    def _parse_llm_response(
        self,
        raw_response: str,
        questions: list[QuestionPerformanceInput],
    ) -> ExamPerformanceAnalysis | None:
        json_payload = self._extract_json_object(raw_response)
        if json_payload is None:
            return None

        try:
            parsed = ExamPerformanceAnalysis.model_validate_json(json_payload)
        except ValidationError:
            return None

        question_ids = {q.question_id for q in questions}
        mapped_ids = {mapping.question_id for mapping in parsed.question_mappings}
        if question_ids != mapped_ids or not 3 <= len(parsed.topic_summaries) <= 5:
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

    def _build_fallback_analysis(
        self,
        questions: list[QuestionPerformanceInput],
    ) -> ExamPerformanceAnalysis:
        topic_names = self._derive_topic_names(questions)
        mappings: list[QuestionTopicMapping] = []

        for index, question in enumerate(questions):
            topic = topic_names[index % len(topic_names)]
            mappings.append(
                QuestionTopicMapping(
                    question_id=question.question_id,
                    topic=topic,
                    performance=self._label_for_score(question.score_earned / question.score_possible),
                    score_earned=question.score_earned,
                    score_possible=question.score_possible,
                )
            )

        grouped_scores: dict[str, list[float]] = defaultdict(list)
        grouped_ids: dict[str, list[str]] = defaultdict(list)
        for mapping in mappings:
            grouped_scores[mapping.topic].append(mapping.score_earned / mapping.score_possible)
            grouped_ids[mapping.topic].append(mapping.question_id)

        topic_summaries: list[TopicPerformanceSummary] = []
        for topic in topic_names:
            topic_average = mean(grouped_scores[topic]) if grouped_scores[topic] else 0.0
            topic_summaries.append(
                TopicPerformanceSummary(
                    topic=topic,
                    question_ids=grouped_ids[topic],
                    average_score_pct=topic_average,
                    performance=self._label_for_score(topic_average),
                )
            )

        strengths = [topic.topic for topic in topic_summaries if topic.performance == "strong"]
        weaknesses = [topic.topic for topic in topic_summaries if topic.performance == "weak"]
        needs_review = [topic.topic for topic in topic_summaries if topic.performance == "needs_review"]

        return ExamPerformanceAnalysis(
            topic_summaries=topic_summaries,
            question_mappings=mappings,
            strengths=strengths,
            weaknesses=weaknesses,
            needs_review=needs_review,
        )

    def _derive_topic_names(self, questions: list[QuestionPerformanceInput]) -> list[str]:
        words: list[str] = []
        for question in questions:
            words.extend(re.findall(r"[A-Za-z]{5,}", question.question_text.lower()))

        stopwords = {
            "which",
            "would",
            "about",
            "after",
            "before",
            "there",
            "their",
            "question",
            "following",
            "explain",
            "describe",
            "correct",
            "answer",
        }
        filtered = [word for word in words if word not in stopwords]

        counts: dict[str, int] = {}
        for word in filtered:
            counts[word] = counts.get(word, 0) + 1

        top_terms = [word for word, _count in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:5]]
        topic_names = [f"Topic: {term.title()}" for term in top_terms]

        while len(topic_names) < 3:
            topic_names.append(f"Topic Category {len(topic_names) + 1}")

        return topic_names[:5]

    def _label_for_score(self, score_pct: float) -> PerformanceLabel:
        if score_pct >= 0.8:
            return "strong"
        if score_pct >= 0.6:
            return "needs_review"
        return "weak"

    def summarize_analysis(self, analysis: ExamPerformanceAnalysis) -> ExamAnalysisSummary:
        """Converts a structured analysis into a concise dashboard summary.

        Guarantees at least one entry in strengths and weaknesses by promoting
        the highest- and lowest-scoring topics when the model returns no clear
        strong/weak classification.

        Args:
            analysis: The structured output from analyze_questions or analyze_upload.

        Returns:
            A flat, dashboard-ready summary with labelled topics and a headline.
        """

        def _to_line(summary: TopicPerformanceSummary) -> TopicSummaryLine:
            label = f"{summary.topic} ({summary.performance.replace('_', ' ')})"
            return TopicSummaryLine(
                label=label,
                topic=summary.topic,
                performance=summary.performance,
                average_score_pct=round(summary.average_score_pct, 3),
            )

        by_performance: dict[str, list[TopicPerformanceSummary]] = defaultdict(list)
        for topic in analysis.topic_summaries:
            by_performance[topic.performance].append(topic)

        strengths = [_to_line(t) for t in by_performance["strong"]]
        weaknesses = [_to_line(t) for t in by_performance["weak"]]
        needs_review = [_to_line(t) for t in by_performance["needs_review"]]

        sorted_topics = sorted(
            analysis.topic_summaries,
            key=lambda t: t.average_score_pct,
        )
        if not strengths:
            best = sorted_topics[-1]
            strengths = [_to_line(best)]
            needs_review = [line for line in needs_review if line.topic != best.topic]

        if not weaknesses:
            worst = sorted_topics[0]
            weaknesses = [_to_line(worst)]
            needs_review = [line for line in needs_review if line.topic != worst.topic]
            strengths = [line for line in strengths if line.topic != worst.topic]

        overall = round(mean(t.average_score_pct for t in analysis.topic_summaries), 3)

        strength_names = ", ".join(line.topic for line in strengths)
        weak_names = ", ".join(line.topic for line in weaknesses)
        headline = f"You performed well in {strength_names}. Focus your revision on {weak_names}."

        return ExamAnalysisSummary(
            strengths=strengths,
            weaknesses=weaknesses,
            needs_review=needs_review,
            headline=headline,
            overall_score_pct=overall,
        )

    def analyze_from_text(self, extracted_text: str) -> ExamPerformanceAnalysis:
        """Analyzes a graded exam from extracted PDF text alone.

        Instructs OpenAI to extract questions, infer topics, and determine
        performance labels from visible grading marks. Returns structured analysis
        with fallback support for malformed LLM responses.

        Args:
            extracted_text: Full text extracted from the graded exam PDF.

        Returns:
            Structured analysis with topics, question mappings, and performance labels.
        """
        normalized_text = extracted_text.strip()
        if not normalized_text:
            return self._build_fallback_from_text("")

        llm_response = self._ai_completion_service.complete(
            system_prompt=self._system_prompt_from_text(),
            user_prompt=self._user_prompt_from_text(extracted_text),
        )
        parsed = self._parse_llm_response_from_text(llm_response)
        if parsed is not None:
            return parsed

        # Fallback: derive topics from text keywords if LLM parsing fails.
        return self._build_fallback_from_text(extracted_text)

    def _system_prompt_from_text(self) -> str:
        return (
            "You are an exam analysis engine. Analyze the provided graded exam text. "
            "Return ONLY valid JSON with no markdown. "
            "Extract questions from the text (identify by numbering or markers). "
            "Infer exactly 3 to 5 topic categories from question content. "
            "Determine performance (strong|needs_review|weak) from visible grading "
            "marks (scores, percentages, check marks, X marks). "
            "If no clear grading is visible, mark all questions with needs_review. "
            "Assign every question to exactly one topic."
        )

    def _user_prompt_from_text(self, extracted_text: str) -> str:
        payload = {
            "exam_text": extracted_text,
            "required_schema": {
                "topic_summaries": [
                    {
                        "topic": "string (3-5 topics total)",
                        "question_ids": ["string (e.g., '1', '2a', 'Q3')"],
                        "average_score_pct": "number between 0 and 1",
                        "performance": "strong|needs_review|weak",
                    }
                ],
                "question_mappings": [
                    {
                        "question_id": "string",
                        "topic": "string",
                        "performance": "strong|needs_review|weak (inferred from grading marks)",
                        "score_earned": "number >= 0 (inferred from marks visible in exam, or 0 if not visible)",
                        "score_possible": "number > 0 (inferred from point values shown, or 1 if not visible)",
                    }
                ],
                "strengths": ["topic names with strong performance"],
                "weaknesses": ["topic names with weak performance"],
                "needs_review": ["topic names with needs_review performance"],
            },
        }
        return json.dumps(payload)

    def _parse_llm_response_from_text(self, raw_response: str) -> ExamPerformanceAnalysis | None:
        json_payload = self._extract_json_object(raw_response)
        if json_payload is None:
            return None

        try:
            parsed = ExamPerformanceAnalysis.model_validate_json(json_payload)
        except ValidationError:
            return None

        return parsed

    def _build_fallback_from_text(self, extracted_text: str) -> ExamPerformanceAnalysis:
        # Extract potential question IDs and derive topics from text.
        question_ids = self._extract_question_ids(extracted_text)
        if not question_ids:
            question_ids = [str(i + 1) for i in range(5)]  # Assume 5 questions if none found

        topic_names = self._derive_topic_names_from_text(extracted_text)

        # Assign each question to a topic and mark as needs_review (conservative fallback).
        mappings: list[QuestionTopicMapping] = []
        for idx, question_id in enumerate(question_ids):
            topic = topic_names[idx % len(topic_names)]
            mappings.append(
                QuestionTopicMapping(
                    question_id=question_id,
                    topic=topic,
                    performance="needs_review",  # Conservative: no visible grading found
                    score_earned=0.0,
                    score_possible=1.0,
                )
            )

        grouped_ids: dict[str, list[str]] = defaultdict(list)
        for mapping in mappings:
            grouped_ids[mapping.topic].append(mapping.question_id)

        topic_summaries: list[TopicPerformanceSummary] = []
        for topic in topic_names:
            topic_summaries.append(
                TopicPerformanceSummary(
                    topic=topic,
                    question_ids=grouped_ids[topic],
                    average_score_pct=0.0,
                    performance="needs_review",
                )
            )

        return ExamPerformanceAnalysis(
            topic_summaries=topic_summaries,
            question_mappings=mappings,
            strengths=[],
            weaknesses=topic_names,  # All topics marked as weaknesses (conservative)
            needs_review=[],
        )

    def _extract_question_ids(self, text: str) -> list[str]:
        """Attempts to extract question identifiers from exam text.

        Looks for common patterns like Q1, Question 1, 1), etc.
        """
        import re

        patterns = [
            r"(?:Question|Q)\s*#?(\d+[a-z]?)",
            r"^(\d+[a-z]?)\s*[.)]",
            r"(\d+[a-z]?)\s*pts?",
        ]

        found: set[str] = set()
        for pattern in patterns:
            matches = re.findall(pattern, text, re.MULTILINE | re.IGNORECASE)
            found.update(matches)

        return sorted(found, key=lambda x: (len(x), x))[:10]  # Limit to top 10

    def _derive_topic_names_from_text(self, text: str) -> list[str]:
        """Derives topic names from keywords in exam text."""
        words: list[str] = []
        words.extend(re.findall(r"[A-Za-z]{5,}", text.lower()))

        stopwords = {
            "which",
            "would",
            "about",
            "after",
            "before",
            "there",
            "their",
            "question",
            "following",
            "explain",
            "describe",
            "correct",
            "answer",
            "point",
            "points",
            "total",
            "exam",
            "test",
            "circle",
            "select",
            "show",
            "work",
            "solve",
        }
        filtered = [word for word in words if word not in stopwords]

        counts: dict[str, int] = {}
        for word in filtered:
            counts[word] = counts.get(word, 0) + 1

        top_terms = [word for word, _count in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:5]]
        topic_names = [f"Topic: {term.title()}" for term in top_terms]

        while len(topic_names) < 3:
            topic_names.append(f"Topic Category {len(topic_names) + 1}")

        return topic_names[:5]
