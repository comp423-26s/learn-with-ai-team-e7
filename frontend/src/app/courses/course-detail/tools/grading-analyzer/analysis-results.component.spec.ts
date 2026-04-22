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
    options: {
      uploadId?: string | null;
      analysis?: Record<string, unknown> | null;
      includeRouteId?: boolean;
    } = {},
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
        snapshot: {
          paramMap: convertToParamMap(options.includeRouteId === false ? {} : { id: '3' }),
        },
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

  it('shows empty-state messages when analysis arrays are empty', async () => {
    const { fixture } = await setup({
      analysis: {
        strengths: [],
        weaknesses: [],
        needs_review: [],
        topic_summaries: [],
      },
    });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('No topic summary available.');
    expect(el.textContent).toContain('No strengths identified.');
    expect(el.textContent).toContain('No weaknesses identified.');
    expect(el.textContent).toContain('No topics currently marked for review.');
  });

  it('falls back for malformed topic summary entries', async () => {
    const { fixture } = await setup({
      analysis: {
        strengths: ['Topic A'],
        weaknesses: [],
        needs_review: [],
        topic_summaries: [{ performance: 123, average_score_pct: 'n/a' }],
      },
    });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Unknown topic');
    expect(el.textContent).toContain('needs_review');
    expect(el.textContent).toContain('0.0%');
  });

  it('shows no topic summary when topic_summaries is not an array', async () => {
    const { fixture } = await setup({
      analysis: {
        strengths: ['Topic A'],
        weaknesses: ['Topic B'],
        needs_review: ['Topic C'],
        topic_summaries: 'not-an-array',
      },
    });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('No topic summary available.');
  });

  it('falls back to NaN course id when route chain has no course id', async () => {
    const { fixture, mockService } = await setup({ includeRouteId: false });
    const component = fixture.componentInstance;

    expect(component['courseId']).toBeNaN();
    expect(mockService.getExamAnalysis).toHaveBeenCalledWith(Number.NaN, 22);
  });

  it('shows no strengths when strengths is not an array', async () => {
    const { fixture } = await setup({
      analysis: {
        strengths: 'not-an-array',
        weaknesses: [],
        needs_review: [],
        topic_summaries: [],
      },
    });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('No strengths identified.');
  });
});
