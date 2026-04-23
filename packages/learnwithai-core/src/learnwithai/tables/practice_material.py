"""Database-backed model for AI-generated practice materials."""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, func
from sqlmodel import Field, SQLModel


class PracticeMaterial(SQLModel, table=True):
    """Stores AI-generated practice questions and flashcards for a student's exam upload."""

    __tablename__ = "practicematerial"  # pyright: ignore[reportAssignmentType]

    __table_args__ = (
        Index("ix_practice_material_upload_id", "upload_id"),
        Index("ix_practice_material_student_pid", "student_pid"),
        Index("ix_practice_material_course_id", "course_id"),
    )

    id: int | None = Field(
        default=None,
        sa_column=Column(Integer, primary_key=True, autoincrement=True),
    )
    upload_id: int = Field(
        sa_column=Column(Integer, ForeignKey("exampdfupload.id"), nullable=False),
    )
    student_pid: int = Field(
        sa_column=Column(Integer, ForeignKey("user.pid"), nullable=False),
    )
    course_id: int = Field(
        sa_column=Column(Integer, ForeignKey("course.id"), nullable=False),
    )
    material_data: dict = Field(
        sa_column=Column(JSON, nullable=False),
    )
    async_job_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("async_job.id"), nullable=True),
    )
    generated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
        ),
        default=None,
    )
