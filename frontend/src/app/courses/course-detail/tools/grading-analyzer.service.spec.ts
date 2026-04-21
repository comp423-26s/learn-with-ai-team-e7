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
    api.invoke
      .mockResolvedValueOnce({ id: 42 })
      .mockResolvedValueOnce({ analysis_data: { strengths: ['Algebra'] } });

    const file = new File(['pdf content'], 'exam.pdf', { type: 'application/pdf' });
    const result = await service.uploadExam(1, file);

    expect(result.uploadId).toBe(42);
    expect(result.analysis).toEqual({ strengths: ['Algebra'] });
    expect(api.invoke).toHaveBeenCalledTimes(2);
  });

  it('returns null analysis when fetch fails', async () => {
    api.invoke.mockResolvedValueOnce({ id: 42 }).mockRejectedValueOnce(new Error('not ready'));

    const file = new File(['pdf content'], 'exam.pdf', { type: 'application/pdf' });
    const result = await service.uploadExam(1, file);

    expect(result).toEqual({ uploadId: 42, analysis: null });
  });
});
