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
 * an in-memory cache keyed by (courseId, uploadId) so re-entering the dashboard
 * reuses the last-loaded analysis instead of making a redundant network round-trip.
 *
 * Cache is invalidated per-upload when a new exam analysis is processed (the
 * `StudentView` calls `setAnalysis` after polling for a fresh result).
 */
@Injectable({ providedIn: 'root' })
export class StudentDashboardStateService {
  private readonly cache = new Map<string, ExamAnalysisSummary | null>();

  /**
   * Generates a unique cache key for a course + upload combination.
   */
  private getCacheKey(courseId: number, uploadId: number): string {
    return `${courseId}:${uploadId}`;
  }

  /**
   * Returns the cached analysis for the given course and upload, or `undefined` when no
   * entry has been stored yet.
   *
   * Returning `undefined` (not `null`) lets callers distinguish "never loaded"
   * from "loaded but the student has no analysis".
   */
  getAnalysis(courseId: number, uploadId: number): ExamAnalysisSummary | null | undefined {
    const key = this.getCacheKey(courseId, uploadId);
    if (!this.cache.has(key)) return undefined;
    return this.cache.get(key) ?? null;
  }

  /** Stores (or overwrites) the analysis result for the given course and upload. */
  setAnalysis(courseId: number, uploadId: number, analysis: ExamAnalysisSummary | null): void {
    const key = this.getCacheKey(courseId, uploadId);
    this.cache.set(key, analysis);
  }
}
