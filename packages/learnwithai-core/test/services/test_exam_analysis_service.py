"""Tests for ExamAnalysisService."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from learnwithai.models.exam_analysis import (
    ExamPerformanceAnalysis,
    QuestionPerformanceInput,
    QuestionTopicMapping,
    TopicPerformanceSummary,
)
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


def test_analyze_upload_falls_back_to_empty_context_when_no_extracted_text_found() -> None:
    """When the repo has no extracted text for the upload, context must be empty string.

    Asserts that analyze_upload delegates to analyze_questions with context=""
    and still returns a valid analysis rather than raising.
    """
    ai_completion = MagicMock()
    text_repo = MagicMock()
    text_repo.get_by_upload_id.return_value = None
    ai_completion.complete.return_value = "not-json"

    service = ExamAnalysisService(ai_completion, text_repo)

    analysis = service.analyze_upload(99, _make_questions())

    text_repo.get_by_upload_id.assert_called_once_with(99)

    prompt = ai_completion.complete.call_args.kwargs["user_prompt"]
    assert '"exam_context": ""' in prompt

    assert 3 <= len(analysis.topic_summaries) <= 5
    assert len(analysis.question_mappings) == 3


def _make_analysis(
    topic_summaries: list[TopicPerformanceSummary],
    question_mappings: list[QuestionTopicMapping],
) -> ExamPerformanceAnalysis:
    """Build an ExamPerformanceAnalysis from summaries, deriving strength/weakness lists."""
    return ExamPerformanceAnalysis(
        topic_summaries=topic_summaries,
        question_mappings=question_mappings,
        strengths=[t.topic for t in topic_summaries if t.performance == "strong"],
        weaknesses=[t.topic for t in topic_summaries if t.performance == "weak"],
        needs_review=[t.topic for t in topic_summaries if t.performance == "needs_review"],
    )


def _mapping(question_id: str, topic: str, earned: float, possible: float) -> QuestionTopicMapping:
    from learnwithai.models.exam_analysis import PerformanceLabel

    pct = earned / possible
    perf: PerformanceLabel = "strong" if pct >= 0.8 else ("needs_review" if pct >= 0.6 else "weak")
    return QuestionTopicMapping(
        question_id=question_id,
        topic=topic,
        performance=perf,
        score_earned=earned,
        score_possible=possible,
    )


# ── test 1: both strengths and weaknesses already present ─────────────────────


def test_summarize_analysis_returns_correct_structure_when_strengths_and_weaknesses_present() -> None:
    """No promotion needed — headline, labels, and overall score reflect raw analysis."""
    topic_summaries = [
        TopicPerformanceSummary(topic="Calculus", question_ids=["q1"], average_score_pct=1.0, performance="strong"),
        TopicPerformanceSummary(topic="Integration", question_ids=["q2"], average_score_pct=0.5, performance="weak"),
        TopicPerformanceSummary(topic="Probability", question_ids=["q3"], average_score_pct=1.0, performance="strong"),
    ]
    mappings = [
        _mapping("q1", "Calculus", 2, 2),
        _mapping("q2", "Integration", 1, 2),
        _mapping("q3", "Probability", 1, 1),
    ]
    service = ExamAnalysisService(MagicMock(), MagicMock())

    summary = service.summarize_analysis(_make_analysis(topic_summaries, mappings))

    assert {line.topic for line in summary.strengths} == {"Calculus", "Probability"}
    assert [line.topic for line in summary.weaknesses] == ["Integration"]
    assert summary.needs_review == []
    assert "Calculus" in summary.headline or "Probability" in summary.headline
    assert "Integration" in summary.headline
    assert summary.overall_score_pct == round((1.0 + 0.5 + 1.0) / 3, 3)
    assert all("(" in line.label and ")" in line.label for line in summary.strengths)


# ── test 2: no weaknesses — worst needs_review topic is promoted ───────────────


def test_summarize_analysis_promotes_lowest_topic_when_no_weak_topics_present() -> None:
    """When every topic is strong or needs_review, the lowest scorer becomes the weakness."""
    topic_summaries = [
        TopicPerformanceSummary(topic="Calculus", question_ids=["q1"], average_score_pct=1.0, performance="strong"),
        TopicPerformanceSummary(
            topic="Integration", question_ids=["q2"], average_score_pct=0.65, performance="needs_review"
        ),
        TopicPerformanceSummary(topic="Probability", question_ids=["q3"], average_score_pct=0.9, performance="strong"),
    ]
    mappings = [
        _mapping("q1", "Calculus", 2, 2),
        _mapping("q2", "Integration", 1.3, 2),
        _mapping("q3", "Probability", 0.9, 1),
    ]
    service = ExamAnalysisService(MagicMock(), MagicMock())

    summary = service.summarize_analysis(_make_analysis(topic_summaries, mappings))

    # Integration is the worst scorer and must be promoted to weaknesses
    assert any(line.topic == "Integration" for line in summary.weaknesses)
    # It must no longer appear in needs_review after promotion
    assert all(line.topic != "Integration" for line in summary.needs_review)
    assert len(summary.strengths) >= 1
    assert "Integration" in summary.headline


# ── test 3: no strengths — best needs_review topic is promoted ─────────────────


def test_summarize_analysis_promotes_highest_topic_when_no_strong_topics_present() -> None:
    """When every topic is weak or needs_review, the highest scorer becomes the strength."""
    topic_summaries = [
        TopicPerformanceSummary(
            topic="Calculus", question_ids=["q1"], average_score_pct=0.7, performance="needs_review"
        ),
        TopicPerformanceSummary(topic="Integration", question_ids=["q2"], average_score_pct=0.4, performance="weak"),
        TopicPerformanceSummary(
            topic="Probability", question_ids=["q3"], average_score_pct=0.75, performance="needs_review"
        ),
    ]
    mappings = [
        _mapping("q1", "Calculus", 0.7, 1),
        _mapping("q2", "Integration", 0.4, 1),
        _mapping("q3", "Probability", 0.75, 1),
    ]
    service = ExamAnalysisService(MagicMock(), MagicMock())

    summary = service.summarize_analysis(_make_analysis(topic_summaries, mappings))

    # Probability is the best scorer and must be promoted to strengths
    assert any(line.topic == "Probability" for line in summary.strengths)
    # It must no longer appear in needs_review after promotion
    assert all(line.topic != "Probability" for line in summary.needs_review)
    # Integration (0.4) is already weak — no second promotion needed
    assert any(line.topic == "Integration" for line in summary.weaknesses)
    assert "Probability" in summary.headline


# ── test 4: all needs_review — both promotions fire ───────────────────────────


def test_summarize_analysis_promotes_both_ends_when_all_topics_are_needs_review() -> None:
    """With no strong or weak topics, the best becomes strength and worst becomes weakness."""
    topic_summaries = [
        TopicPerformanceSummary(
            topic="Calculus", question_ids=["q1"], average_score_pct=0.7, performance="needs_review"
        ),
        TopicPerformanceSummary(
            topic="Integration", question_ids=["q2"], average_score_pct=0.62, performance="needs_review"
        ),
        TopicPerformanceSummary(
            topic="Probability", question_ids=["q3"], average_score_pct=0.75, performance="needs_review"
        ),
    ]
    mappings = [
        _mapping("q1", "Calculus", 0.7, 1),
        _mapping("q2", "Integration", 0.62, 1),
        _mapping("q3", "Probability", 0.75, 1),
    ]
    service = ExamAnalysisService(MagicMock(), MagicMock())

    summary = service.summarize_analysis(_make_analysis(topic_summaries, mappings))

    # Best (Probability 0.75) → promoted to strength
    assert any(line.topic == "Probability" for line in summary.strengths)
    # Worst (Integration 0.62) → promoted to weakness
    assert any(line.topic == "Integration" for line in summary.weaknesses)
    # Neither promoted topic leaks into needs_review
    assert all(line.topic not in {"Probability", "Integration"} for line in summary.needs_review)
    # Remaining topic (Calculus) stays in needs_review
    assert any(line.topic == "Calculus" for line in summary.needs_review)
    assert len(summary.strengths) >= 1
    assert len(summary.weaknesses) >= 1
