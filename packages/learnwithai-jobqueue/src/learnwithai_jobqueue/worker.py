# Copyright (c) 2026 Kris Jordan
# SPDX-License-Identifier: MIT

"""
Run the worker via `dramatiq`:

uv run --package learnwithai-jobqueue dramatiq learnwithai_jobqueue.worker
"""

import logging

import learnwithai.practice_material.job  # noqa: F401

import learnwithai_jobqueue.dramatiq_job_queue  # noqa: F401

logger = logging.getLogger(__name__)
logger.info("Worker Ready")
