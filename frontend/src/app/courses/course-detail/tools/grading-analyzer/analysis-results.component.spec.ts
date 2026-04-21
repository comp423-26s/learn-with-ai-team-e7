/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AnalysisResultsComponent } from './analysis-results.component';
import { GradingAnalyzerService } from '../grading-analyzer.service';
import { PageTitleService } from '../../../../page-title.service';

describe('AnalysisResultsComponent', () => {
  async function setup(
    options: { uploadId?: string | null; analysis?: Record<string, unknown> | null } = {},
  ) {
    const hasAnalysisOverride = Object.prototype.hasOwnProperty.call(options, 'analysis');
    const mockService = {
      getExamAnalysis: vi.fn().mockResolvedValue(
        hasAnalysisOverride
          ? options.analysis
          : {
              strengths: ['Algebra'],
              weaknesses: ['Geometry'],
              needs_review: ['Trigonometry'],
              topic_summaries: [
                { topic: 'Algebra', performance: 'strong', average_score_pct: 0.9 },
                { topic: 'Geometry', performance: 'weak', average_score_pct: 0.4 },
              ],
            },
      ),
    };

    const queryParams = options.uploadId === null ? {} : { uploadId: options.uploadId ?? '22' };

    const mockRoute = {
      snapshot: {
        queryParamMap: convertToParamMap(queryParams),
        paramMap: convertToParamMap({}),
      },
      parent: {
        snapshot: { paramMap: convertToParamMap({ id: '3' }) },
        parent: null,
      },
    };

    TestBed.configureTestingModule({
      imports: [AnalysisResultsComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: GradingAnalyzerService, useValue: mockService },
        { provide: PageTitleService, useValue: { setTitle: vi.fn() } },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(AnalysisResultsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture, mockService };
  }

  it('loads and renders analysis data', async () => {
    const { fixture } = await setup();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Topic Summary');
    expect(el.textContent).toContain('Algebra');
    expect(el.textContent).toContain('Geometry');
    expect(el.textContent).toContain('Trigonometry');
  });

  it('shows error for invalid upload id', async () => {
    const { fixture } = await setup({ uploadId: null });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Missing or invalid upload ID.');
  });

  it('shows not-available message when analysis is null', async () => {
    const { fixture } = await setup({ analysis: null });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Analysis not available yet.');
  });
});
