/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { Injectable } from '@angular/core';
import type { ExamAnalysisSummary } from '../../../api/generated/models/exam-analysis-summary';

export interface CachedExamAnalysis {
  uploadId: number | null;
  analysis: ExamAnalysisSummary | null;
}

/**
 * Persists the student dashboard analysis state across component navigations.
 *
 * Angular destroys and recreates routed components on each navigation, so any
 * signal state held in the component is lost. This root-scoped service acts as
 * an in-memory cache keyed by course ID so re-entering the dashboard can reuse
 * the last-loaded analysis for the upload that produced it.
 *
 * Cache is invalidated per-course when a new exam upload is processed (the
 * `StudentView` calls `setAnalysis` after polling for a fresh result).
 */
@Injectable({ providedIn: 'root' })
export class StudentDashboardStateService {
  private readonly cache = new Map<number, CachedExamAnalysis>();

  /**
   * Returns the cached analysis for the given course, or `undefined` when no
   * entry has been stored yet.
   *
   * Returning `undefined` (not `null`) lets callers distinguish "never loaded"
   * from "loaded but the student has no analysis".
   */
  getAnalysis(courseId: number): ExamAnalysisSummary | null | undefined {
    if (!this.cache.has(courseId)) return undefined;
    return this.cache.get(courseId)?.analysis ?? null;
  }

  /** Returns the cached analysis together with the upload that produced it. */
  getCachedAnalysis(courseId: number): CachedExamAnalysis | undefined {
    return this.cache.get(courseId);
  }

  /** Stores (or overwrites) the analysis result for the given course and upload. */
  setAnalysis(
    courseId: number,
    analysis: ExamAnalysisSummary | null,
    uploadId: number | null = null,
  ): void {
    this.cache.set(courseId, { uploadId, analysis });
  }
}
