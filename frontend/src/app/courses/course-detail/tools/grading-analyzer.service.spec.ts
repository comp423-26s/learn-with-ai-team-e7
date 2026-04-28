/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing';
import { Api } from '../../../api/generated/api';
import { GradingAnalyzerService } from './grading-analyzer.service';

describe('GradingAnalyzerService', () => {
  let service: GradingAnalyzerService;
  let api: { invoke: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { invoke: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: api }],
    });
    service = TestBed.inject(GradingAnalyzerService);
  });

  it('uploads and returns analysis when available', async () => {
    api.invoke.mockResolvedValueOnce({ id: 42 }).mockResolvedValueOnce({
      analysis_data: {
        headline: 'Good job!',
        overall_score_pct: 0.9,
        strengths: [
          {
            label: 'Algebra (strong)',
            topic: 'Algebra',
            performance: 'strong',
            average_score_pct: 0.9,
          },
        ],
        weaknesses: [],
        needs_review: [],
      },
    });

    const file = new File(['pdf content'], 'exam.pdf', { type: 'application/pdf' });
    const result = await service.uploadExam(1, file);

    expect(result.uploadId).toBe(42);
    expect(result.analysis?.headline).toBe('Good job!');
    expect(result.analysis?.strengths[0].topic).toBe('Algebra');
    expect(api.invoke).toHaveBeenCalledTimes(2);
  });

  it('returns null analysis when fetch fails', async () => {
    api.invoke.mockResolvedValueOnce({ id: 42 }).mockRejectedValueOnce(new Error('not ready'));

    const file = new File(['pdf content'], 'exam.pdf', { type: 'application/pdf' });
    const result = await service.uploadExam(1, file);

    expect(result).toEqual({ uploadId: 42, analysis: null });
  });

  it('gets persisted analysis when available', async () => {
    api.invoke.mockResolvedValueOnce({
      analysis_data: {
        headline: 'You did well in Math.',
        overall_score_pct: 0.85,
        strengths: [
          { label: 'Math (strong)', topic: 'Math', performance: 'strong', average_score_pct: 0.9 },
        ],
        weaknesses: [],
        needs_review: [],
      },
    });

    const result = await service.getExamAnalysis(3, 11);

    expect(result?.headline).toBe('You did well in Math.');
    expect(result?.strengths[0].topic).toBe('Math');
    expect(api.invoke).toHaveBeenCalledTimes(1);
  });

  it('returns null when persisted analysis fetch fails', async () => {
    api.invoke.mockRejectedValueOnce(new Error('not ready'));

    const result = await service.getExamAnalysis(3, 11);

    expect(result).toBeNull();
  });

  it('getLatestAnalysis returns the most recent analysis when one exists', async () => {
    api.invoke
      .mockResolvedValueOnce([
        {
          id: 7,
          has_analysis: false,
          has_practice: false,
          original_filename: 'old.pdf',
          uploaded_at: '',
        },
        {
          id: 8,
          has_analysis: true,
          has_practice: false,
          original_filename: 'exam.pdf',
          uploaded_at: '',
        },
      ])
      .mockResolvedValueOnce({
        analysis_data: {
          headline: 'Well done!',
          overall_score_pct: 0.8,
          strengths: [
            {
              label: 'Algebra (strong)',
              topic: 'Algebra',
              performance: 'strong',
              average_score_pct: 0.85,
            },
          ],
          weaknesses: [],
          needs_review: [],
        },
      });

    const result = await service.getLatestAnalysis(1);

    expect(result?.headline).toBe('Well done!');
    expect(result?.strengths[0].topic).toBe('Algebra');
  });

  it('getLatestAnalysis returns null when no upload has an analysis', async () => {
    api.invoke.mockResolvedValueOnce([
      {
        id: 5,
        has_analysis: false,
        has_practice: false,
        original_filename: 'exam.pdf',
        uploaded_at: '',
      },
    ]);

    const result = await service.getLatestAnalysis(1);

    expect(result).toBeNull();
    expect(api.invoke).toHaveBeenCalledTimes(1);
  });

  it('getLatestAnalysis returns null when the history list is empty', async () => {
    api.invoke.mockResolvedValueOnce([]);

    const result = await service.getLatestAnalysis(1);

    expect(result).toBeNull();
  });

  it('getLatestAnalysis returns null when the API call throws', async () => {
    api.invoke.mockRejectedValueOnce(new Error('network error'));

    const result = await service.getLatestAnalysis(1);

    expect(result).toBeNull();
  });
});
