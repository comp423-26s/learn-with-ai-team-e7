"""Database-backed model for extracted exam PDF text."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Text, func
from sqlmodel import Field, SQLModel


class ExamPdfText(SQLModel, table=True):
    """Represents extracted text for an uploaded exam PDF."""

    __table_args__ = (Index("ix_exam_pdf_text_upload_id", "upload_id"),)

    id: int | None = Field(
        default=None,
        sa_column=Column(Integer, primary_key=True, autoincrement=True),
    )
    upload_id: int = Field(
        sa_column=Column(Integer, ForeignKey("exam_pdf_upload.id"), nullable=False),
    )
    extracted_text: str = Field(
        sa_column=Column(Text, nullable=False),
    )
    extracted_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
        default=None,
    )
