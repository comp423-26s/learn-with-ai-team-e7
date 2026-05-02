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

  it('returns undefined for a course/upload that has never been set', () => {
    expect(service.getAnalysis(99, 1)).toBeUndefined();
  });

  it('stores and retrieves an analysis', () => {
    const analysis = makeAnalysis('Great job!');
    service.setAnalysis(1, 100, analysis);
    expect(service.getAnalysis(1, 100)).toEqual(analysis);
  });

  it('stores null and returns null (no analysis available)', () => {
    service.setAnalysis(2, 101, null);
    expect(service.getAnalysis(2, 101)).toBeNull();
  });

  it('overwrites a previous value when set is called again', () => {
    const first = makeAnalysis('First');
    const second = makeAnalysis('Second');
    service.setAnalysis(3, 102, first);
    service.setAnalysis(3, 102, second);
    expect(service.getAnalysis(3, 102)?.headline).toBe('Second');
  });

  it('caches independently per course id and upload id', () => {
    service.setAnalysis(10, 200, makeAnalysis('Course 10 Upload 200'));
    service.setAnalysis(11, 201, makeAnalysis('Course 11 Upload 201'));
    service.setAnalysis(10, 202, makeAnalysis('Course 10 Upload 202'));
    expect(service.getAnalysis(10, 200)?.headline).toBe('Course 10 Upload 200');
    expect(service.getAnalysis(11, 201)?.headline).toBe('Course 11 Upload 201');
    expect(service.getAnalysis(10, 202)?.headline).toBe('Course 10 Upload 202');
    expect(service.getAnalysis(10, 203)).toBeUndefined();
    expect(service.getAnalysis(12, 200)).toBeUndefined();
  });
});
