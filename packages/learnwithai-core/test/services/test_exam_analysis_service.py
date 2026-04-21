"""Tests for ExamAnalysisService."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from learnwithai.models.exam_analysis import QuestionPerformanceInput
from learnwithai.services.exam_analysis_service import ExamAnalysisService


def _make_questions() -> list[QuestionPerformanceInput]:
    return [
        QuestionPerformanceInput(
            question_id="q1",
            question_text="Compute the derivative of x^2 and interpret its slope.",
            score_earned=2,
            score_possible=2,
        ),
        QuestionPerformanceInput(
            question_id="q2",
            question_text="Find the integral under a simple polynomial curve.",
            score_earned=1,
            score_possible=2,
        ),
        QuestionPerformanceInput(
            question_id="q3",
            question_text="Use conditional probability to evaluate an event.",
            score_earned=1,
            score_possible=1,
        ),
    ]


def test_analyze_questions_returns_structured_llm_json_when_valid() -> None:
    ai_completion = MagicMock()
    text_repo = MagicMock()
    service = ExamAnalysisService(ai_completion, text_repo)
    ai_completion.complete.return_value = json.dumps(
        {
            "topic_summaries": [
                {
                    "topic": "Calculus",
                    "question_ids": ["q1"],
                    "average_score_pct": 1.0,
                    "performance": "strong",
                },
                {
                    "topic": "Integration",
                    "question_ids": ["q2"],
                    "average_score_pct": 0.5,
                    "performance": "weak",
                },
                {
                    "topic": "Probability",
                    "question_ids": ["q3"],
                    "average_score_pct": 1.0,
                    "performance": "strong",
                },
            ],
            "question_mappings": [
                {
                    "question_id": "q1",
                    "topic": "Calculus",
                    "performance": "strong",
                    "score_earned": 2,
                    "score_possible": 2,
                },
                {
                    "question_id": "q2",
                    "topic": "Integration",
                    "performance": "weak",
                    "score_earned": 1,
                    "score_possible": 2,
                },
                {
                    "question_id": "q3",
                    "topic": "Probability",
                    "performance": "strong",
                    "score_earned": 1,
                    "score_possible": 1,
                },
            ],
            "strengths": ["Calculus", "Probability"],
            "weaknesses": ["Integration"],
            "needs_review": [],
        }
    )

    analysis = service.analyze_questions(_make_questions(), exam_context="Exam text")

    assert len(analysis.topic_summaries) == 3
    assert {mapping.question_id for mapping in analysis.question_mappings} == {"q1", "q2", "q3"}
    assert analysis.weaknesses == ["Integration"]
    assert analysis.strengths == ["Calculus", "Probability"]


def test_analyze_questions_falls_back_when_llm_response_is_invalid_json() -> None:
    ai_completion = MagicMock()
    text_repo = MagicMock()
    service = ExamAnalysisService(ai_completion, text_repo)
    ai_completion.complete.return_value = "not-json"

    analysis = service.analyze_questions(_make_questions(), exam_context="Exam text")

    assert 3 <= len(analysis.topic_summaries) <= 5
    assert len(analysis.question_mappings) == 3
    assert {m.performance for m in analysis.question_mappings} == {"strong", "weak"}


def test_analyze_upload_uses_extracted_text_context() -> None:
    ai_completion = MagicMock()
    text_repo = MagicMock()
    extracted = MagicMock()
    extracted.extracted_text = "Section A: Differentiation and Probability"
    text_repo.get_by_upload_id.return_value = extracted

    ai_completion.complete.return_value = json.dumps(
        {
            "topic_summaries": [
                {
                    "topic": "Calculus",
                    "question_ids": ["q1"],
                    "average_score_pct": 1.0,
                    "performance": "strong",
                },
                {
                    "topic": "Integration",
                    "question_ids": ["q2"],
                    "average_score_pct": 0.5,
                    "performance": "weak",
                },
                {
                    "topic": "Probability",
                    "question_ids": ["q3"],
                    "average_score_pct": 1.0,
                    "performance": "strong",
                },
            ],
            "question_mappings": [
                {
                    "question_id": "q1",
                    "topic": "Calculus",
                    "performance": "strong",
                    "score_earned": 2,
                    "score_possible": 2,
                },
                {
                    "question_id": "q2",
                    "topic": "Integration",
                    "performance": "weak",
                    "score_earned": 1,
                    "score_possible": 2,
                },
                {
                    "question_id": "q3",
                    "topic": "Probability",
                    "performance": "strong",
                    "score_earned": 1,
                    "score_possible": 1,
                },
            ],
            "strengths": ["Calculus", "Probability"],
            "weaknesses": ["Integration"],
            "needs_review": [],
        }
    )
    service = ExamAnalysisService(ai_completion, text_repo)

    analysis = service.analyze_upload(44, _make_questions())

    text_repo.get_by_upload_id.assert_called_once_with(44)
    ai_completion.complete.assert_called_once()
    prompt = ai_completion.complete.call_args.kwargs["user_prompt"]
    assert "Differentiation and Probability" in prompt
    assert len(analysis.topic_summaries) == 3


def test_analyze_questions_raises_for_empty_inputs() -> None:
    service = ExamAnalysisService(MagicMock(), MagicMock())

    with pytest.raises(ValueError, match="At least one question"):
        service.analyze_questions([], exam_context="")


def test_analyze_questions_falls_back_when_llm_json_fails_schema_validation() -> None:
    ai_completion = MagicMock()
    service = ExamAnalysisService(ai_completion, MagicMock())
    ai_completion.complete.return_value = "{}"

    analysis = service.analyze_questions(_make_questions(), exam_context="Exam text")

    assert len(analysis.question_mappings) == 3


def test_analyze_questions_falls_back_when_question_mapping_ids_do_not_match() -> None:
    ai_completion = MagicMock()
    service = ExamAnalysisService(ai_completion, MagicMock())
    ai_completion.complete.return_value = json.dumps(
        {
            "topic_summaries": [
                {
                    "topic": "Calculus",
                    "question_ids": ["q1"],
                    "average_score_pct": 1.0,
                    "performance": "strong",
                },
                {
                    "topic": "Integration",
                    "question_ids": ["q2"],
                    "average_score_pct": 0.5,
                    "performance": "weak",
                },
                {
                    "topic": "Probability",
                    "question_ids": ["q3"],
                    "average_score_pct": 1.0,
                    "performance": "strong",
                },
            ],
            "question_mappings": [
                {
                    "question_id": "q1",
                    "topic": "Calculus",
                    "performance": "strong",
                    "score_earned": 2,
                    "score_possible": 2,
                },
                {
                    "question_id": "q2",
                    "topic": "Integration",
                    "performance": "weak",
                    "score_earned": 1,
                    "score_possible": 2,
                },
            ],
            "strengths": ["Calculus"],
            "weaknesses": ["Integration"],
            "needs_review": ["Probability"],
        }
    )

    analysis = service.analyze_questions(_make_questions(), exam_context="Exam text")

    assert len(analysis.question_mappings) == 3


def test_analyze_questions_falls_back_when_topic_summary_count_is_invalid() -> None:
    ai_completion = MagicMock()
    service = ExamAnalysisService(ai_completion, MagicMock())
    ai_completion.complete.return_value = json.dumps(
        {
            "topic_summaries": [
                {
                    "topic": "Calculus",
                    "question_ids": ["q1", "q2"],
                    "average_score_pct": 0.75,
                    "performance": "needs_review",
                },
                {
                    "topic": "Probability",
                    "question_ids": ["q3"],
                    "average_score_pct": 1.0,
                    "performance": "strong",
                },
            ],
            "question_mappings": [
                {
                    "question_id": "q1",
                    "topic": "Calculus",
                    "performance": "strong",
                    "score_earned": 2,
                    "score_possible": 2,
                },
                {
                    "question_id": "q2",
                    "topic": "Calculus",
                    "performance": "weak",
                    "score_earned": 1,
                    "score_possible": 2,
                },
                {  # q3 was missing — caused early exit at the ID mismatch check
                    "question_id": "q3",
                    "topic": "Probability",
                    "performance": "strong",
                    "score_earned": 1,
                    "score_possible": 1,
                },
            ],
            "strengths": ["Probability"],
            "weaknesses": ["Calculus"],
            "needs_review": [],
        }
    )

    analysis = service.analyze_questions(_make_questions(), exam_context="Exam text")

    assert 3 <= len(analysis.topic_summaries) <= 5


def test_analyze_questions_parses_json_embedded_in_text_wrapper() -> None:
    ai_completion = MagicMock()
    service = ExamAnalysisService(ai_completion, MagicMock())
    payload = {
        "topic_summaries": [
            {
                "topic": "Calculus",
                "question_ids": ["q1"],
                "average_score_pct": 1.0,
                "performance": "strong",
            },
            {
                "topic": "Integration",
                "question_ids": ["q2"],
                "average_score_pct": 0.5,
                "performance": "weak",
            },
            {
                "topic": "Probability",
                "question_ids": ["q3"],
                "average_score_pct": 1.0,
                "performance": "strong",
            },
        ],
        "question_mappings": [
            {
                "question_id": "q1",
                "topic": "Calculus",
                "performance": "strong",
                "score_earned": 2,
                "score_possible": 2,
            },
            {
                "question_id": "q2",
                "topic": "Integration",
                "performance": "weak",
                "score_earned": 1,
                "score_possible": 2,
            },
            {
                "question_id": "q3",
                "topic": "Probability",
                "performance": "strong",
                "score_earned": 1,
                "score_possible": 1,
            },
        ],
        "strengths": ["Calculus", "Probability"],
        "weaknesses": ["Integration"],
        "needs_review": [],
    }
    ai_completion.complete.return_value = f"Analysis follows:\n{json.dumps(payload)}\nEnd."

    analysis = service.analyze_questions(_make_questions(), exam_context="Exam text")

    assert analysis.strengths == ["Calculus", "Probability"]


def test_fallback_adds_topic_padding_and_needs_review_label() -> None:
    ai_completion = MagicMock()
    service = ExamAnalysisService(ai_completion, MagicMock())
    ai_completion.complete.return_value = "{bad-json"
    one_question = [
        QuestionPerformanceInput(
            question_id="q1",
            question_text="Which about after there answer",
            score_earned=7,
            score_possible=10,
        )
    ]

    analysis = service.analyze_questions(one_question, exam_context="Exam text")

    assert len(analysis.topic_summaries) == 3
    assert analysis.question_mappings[0].performance == "needs_review"


def test_analyze_questions_falls_back_when_topic_summary_count_exceeds_maximum() -> None:
    ai_completion = MagicMock()
    service = ExamAnalysisService(ai_completion, MagicMock())
    ai_completion.complete.return_value = json.dumps(
        {
            "topic_summaries": [
                {"topic": "Calculus", "question_ids": ["q1"], "average_score_pct": 1.0, "performance": "strong"},
                {"topic": "Integration", "question_ids": ["q2"], "average_score_pct": 0.5, "performance": "weak"},
                {"topic": "Probability", "question_ids": ["q3"], "average_score_pct": 1.0, "performance": "strong"},
                {"topic": "Algebra", "question_ids": [], "average_score_pct": 0.0, "performance": "weak"},
                {"topic": "Geometry", "question_ids": [], "average_score_pct": 0.0, "performance": "weak"},
                {"topic": "Statistics", "question_ids": [], "average_score_pct": 0.0, "performance": "weak"},
            ],
            "question_mappings": [
                {
                    "question_id": "q1",
                    "topic": "Calculus",
                    "performance": "strong",
                    "score_earned": 2,
                    "score_possible": 2,
                },
                {
                    "question_id": "q2",
                    "topic": "Integration",
                    "performance": "weak",
                    "score_earned": 1,
                    "score_possible": 2,
                },
                {
                    "question_id": "q3",
                    "topic": "Probability",
                    "performance": "strong",
                    "score_earned": 1,
                    "score_possible": 1,
                },
            ],
            "strengths": ["Calculus", "Probability"],
            "weaknesses": ["Integration"],
            "needs_review": [],
        }
    )

    analysis = service.analyze_questions(_make_questions(), exam_context="Exam text")

    assert 3 <= len(analysis.topic_summaries) <= 5
