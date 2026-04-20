# Copyright (c) 2026 Kris Jordan
# SPDX-License-Identifier: MIT

"""Imports all SQLModel table modules so metadata registration is explicit."""

from .activity import Activity, ActivityType
from .async_job import AsyncJob, AsyncJobStatus
from .course import Course
from .exam_pdf_text import ExamPdfText
from .exam_pdf_upload import ExamPdfUpload
from .membership import Membership
from .operator import Operator, OperatorPermission, OperatorRole
from .submission import Submission
from .user import User

# Copyright (c) 2026 Kris Jordan
# SPDX-License-Identifier: MIT

"""Imports all SQLModel table modules so metadata registration is explicit."""


__all__ = [
    "Activity",
    "ActivityType",
    "AsyncJob",
    "AsyncJobStatus",
    "Course",
    "ExamPdfUpload",
    "ExamPdfText",
    "Membership",
    "Operator",
    "OperatorPermission",
    "OperatorRole",
    "Submission",
    "User",
]
