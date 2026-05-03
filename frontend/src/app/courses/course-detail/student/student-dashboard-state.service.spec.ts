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
    service.setAnalysis(1, analysis);
    expect(service.getAnalysis(1)).toEqual(analysis);
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

  describe('upload-ID-scoped cache', () => {
    it('returns undefined for an upload that has never been set', () => {
      expect(service.getAnalysisByUploadId(999)).toBeUndefined();
    });

    it('stores and retrieves analysis by upload id', () => {
      const analysis = makeAnalysis('Upload result');
      service.setAnalysisByUploadId(42, analysis);
      expect(service.getAnalysisByUploadId(42)).toEqual(analysis);
    });

    it('stores null and returns null for an upload with no analysis', () => {
      service.setAnalysisByUploadId(7, null);
      expect(service.getAnalysisByUploadId(7)).toBeNull();
    });

    it('overwrites a previous value when set is called again for the same upload', () => {
      service.setAnalysisByUploadId(5, makeAnalysis('First upload result'));
      service.setAnalysisByUploadId(5, makeAnalysis('Second upload result'));
      expect(service.getAnalysisByUploadId(5)?.headline).toBe('Second upload result');
    });

    it('caches independently per upload id', () => {
      service.setAnalysisByUploadId(100, makeAnalysis('Upload 100'));
      service.setAnalysisByUploadId(101, makeAnalysis('Upload 101'));
      expect(service.getAnalysisByUploadId(100)?.headline).toBe('Upload 100');
      expect(service.getAnalysisByUploadId(101)?.headline).toBe('Upload 101');
      expect(service.getAnalysisByUploadId(102)).toBeUndefined();
    });

    it('does not share cache with the course-level cache', () => {
      service.setAnalysis(1, makeAnalysis('Course analysis'));
      expect(service.getAnalysisByUploadId(1)).toBeUndefined();
      service.setAnalysisByUploadId(1, makeAnalysis('Upload analysis'));
      expect(service.getAnalysis(1)?.headline).toBe('Course analysis');
    });
  });
});
