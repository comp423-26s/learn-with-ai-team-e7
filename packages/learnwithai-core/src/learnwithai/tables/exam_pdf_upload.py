"""Database-backed models for uploaded exam PDFs."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, func
from sqlmodel import Field, SQLModel


class ExamPdfUpload(SQLModel, table=True):
    """Represents an uploaded PDF stored in object storage."""

    __table_args__ = (
        Index("ix_exam_pdf_upload_course_id", "course_id"),
        Index("ix_exam_pdf_upload_uploader_pid", "uploader_pid"),
    )

    id: int | None = Field(
        default=None,
        sa_column=Column(Integer, primary_key=True, autoincrement=True),
    )
    course_id: int = Field(
        sa_column=Column(Integer, ForeignKey("course.id"), nullable=False),
    )
    uploader_pid: int = Field(
        sa_column=Column(Integer, ForeignKey("user.pid"), nullable=False),
    )
    storage_key: str = Field(
        sa_column=Column(String(512), nullable=False, unique=True),
    )
    original_filename: str = Field(
        sa_column=Column(String(255), nullable=False),
    )
    content_type: str = Field(
        sa_column=Column(String(64), nullable=False),
    )
    size_bytes: int = Field(
        sa_column=Column(Integer, nullable=False),
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
        ),
        default=None,
    )
