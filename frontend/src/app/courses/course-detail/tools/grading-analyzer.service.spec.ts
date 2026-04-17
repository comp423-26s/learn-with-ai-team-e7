/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing';
import { GradingAnalyzerService } from './grading-analyzer.service';
import { Api } from '../../../api/generated/api';

describe('GradingAnalyzerService', () => {
  let service: GradingAnalyzerService;

  beforeEach(() => {
    const api = { invoke: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: api }],
    });
    service = TestBed.inject(GradingAnalyzerService);
  });

  it('resolves with a submissionId', async () => {
    const file = new File(['pdf content'], 'exam.pdf', { type: 'application/pdf' });
    const result = await service.uploadExam(1, file, 'Exam 1', 85);
    expect(result).toEqual({ submissionId: 1 });
  });
});
