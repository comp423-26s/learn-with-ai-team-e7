/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing';
import { StudentDashboardStateService } from './student-dashboard-state.service';
import type { ExamAnalysisSummary } from '../../../api/generated/models/exam-analysis-summary';

const makeAnalysis = (headline: string): ExamAnalysisSummary => ({
  headline,
  overall_score_pct: 0.8,
  strengths: [],
  needs_review: [],
  weaknesses: [],
});

describe('StudentDashboardStateService', () => {
  let service: StudentDashboardStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StudentDashboardStateService);
  });

  it('returns undefined for a course that has never been set', () => {
    expect(service.getAnalysis(99)).toBeUndefined();
  });

  it('stores and retrieves an analysis', () => {
    const analysis = makeAnalysis('Great job!');
    service.setAnalysis(1, analysis, 42);
    expect(service.getAnalysis(1)).toEqual(analysis);
    expect(service.getCachedAnalysis(1)).toEqual({ uploadId: 42, analysis });
  });

  it('stores null and returns null (no analysis available)', () => {
    service.setAnalysis(2, null);
    expect(service.getAnalysis(2)).toBeNull();
  });

  it('overwrites a previous value when set is called again', () => {
    const first = makeAnalysis('First');
    const second = makeAnalysis('Second');
    service.setAnalysis(3, first);
    service.setAnalysis(3, second);
    expect(service.getAnalysis(3)?.headline).toBe('Second');
  });

  it('caches independently per course id', () => {
    service.setAnalysis(10, makeAnalysis('Course 10'));
    service.setAnalysis(11, makeAnalysis('Course 11'));
    expect(service.getAnalysis(10)?.headline).toBe('Course 10');
    expect(service.getAnalysis(11)?.headline).toBe('Course 11');
    expect(service.getAnalysis(12)).toBeUndefined();
  });
});
