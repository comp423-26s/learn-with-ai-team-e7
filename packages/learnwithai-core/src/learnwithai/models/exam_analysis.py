# Copyright (c) 2026 Kris Jordan
# SPDX-License-Identifier: MIT

"""Typed models for exam topic mapping and performance analysis outputs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PerformanceLabel = Literal["strong", "needs_review", "weak"]


class QuestionPerformanceInput(BaseModel):
    """Normalized per-question performance input from grading data."""

    question_id: str = Field(min_length=1)
    question_text: str = Field(min_length=1)
    score_earned: float = Field(ge=0)
    score_possible: float = Field(gt=0)


class QuestionTopicMapping(BaseModel):
    """Topic and performance mapping for one question."""

    question_id: str
    topic: str
    performance: PerformanceLabel
    score_earned: float = Field(ge=0)
    score_possible: float = Field(gt=0)


class TopicPerformanceSummary(BaseModel):
    """Aggregate performance information for one inferred topic."""

    topic: str
    question_ids: list[str]
    average_score_pct: float = Field(ge=0, le=1)
    performance: PerformanceLabel


class ExamPerformanceAnalysis(BaseModel):
    """Structured JSON-safe output that the frontend can consume directly."""

    model_config = ConfigDict(extra="forbid")

    topic_summaries: list[TopicPerformanceSummary] = Field(min_length=3, max_length=5)
    question_mappings: list[QuestionTopicMapping] = Field(min_length=1)
    strengths: list[str]
    weaknesses: list[str]
    needs_review: list[str]
