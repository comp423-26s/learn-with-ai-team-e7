/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { Injectable } from '@angular/core';
import type { ExamAnalysisSummary } from '../../../api/generated/models/exam-analysis-summary';

/**
 * Persists the student dashboard analysis state across component navigations.
 *
 * Angular destroys and recreates routed components on each navigation, so any
 * signal state held in the component is lost. This root-scoped service acts as
 * an in-memory cache keyed by course ID so re-entering the dashboard reuses
 * the last-loaded analysis instead of making a redundant network round-trip.
 *
 * Cache is invalidated per-course when a new exam upload is processed (the
 * `StudentView` calls `setAnalysis` after polling for a fresh result).
 */
@Injectable({ providedIn: 'root' })
export class StudentDashboardStateService {
  private readonly cache = new Map<number, ExamAnalysisSummary | null>();
  private readonly uploadCache = new Map<number, ExamAnalysisSummary | null>();

  /**
   * Returns the cached analysis for the given course, or `undefined` when no
   * entry has been stored yet.
   *
   * Returning `undefined` (not `null`) lets callers distinguish "never loaded"
   * from "loaded but the student has no analysis".
   */
  getAnalysis(courseId: number): ExamAnalysisSummary | null | undefined {
    if (!this.cache.has(courseId)) return undefined;
    return this.cache.get(courseId) ?? null;
  }

  /** Stores (or overwrites) the analysis result for the given course. */
  setAnalysis(courseId: number, analysis: ExamAnalysisSummary | null): void {
    this.cache.set(courseId, analysis);
  }

  /**
   * Returns the cached analysis for a specific upload ID, or `undefined` when
   * no entry has been stored for that upload yet.
   */
  getAnalysisByUploadId(uploadId: number): ExamAnalysisSummary | null | undefined {
    if (!this.uploadCache.has(uploadId)) return undefined;
    return this.uploadCache.get(uploadId) ?? null;
  }

  /** Stores (or overwrites) the analysis result for a specific upload ID. */
  setAnalysisByUploadId(uploadId: number, analysis: ExamAnalysisSummary | null): void {
    this.uploadCache.set(uploadId, analysis);
  }
}
