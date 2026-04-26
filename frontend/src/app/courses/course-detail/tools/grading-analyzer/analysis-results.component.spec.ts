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
import type { ExamAnalysisSummary } from '../../../../api/generated/models/exam-analysis-summary';

const STUB_ANALYSIS: ExamAnalysisSummary = {
  headline: 'You performed well in Algebra. Focus your revision on Geometry.',
  overall_score_pct: 0.667,
  strengths: [
    { label: 'Algebra (strong)', topic: 'Algebra', performance: 'strong', average_score_pct: 0.9 },
  ],
  weaknesses: [
    { label: 'Geometry (weak)', topic: 'Geometry', performance: 'weak', average_score_pct: 0.4 },
  ],
  needs_review: [
    {
      label: 'Trigonometry (needs review)',
      topic: 'Trigonometry',
      performance: 'needs_review',
      average_score_pct: 0.7,
    },
  ],
};

describe('AnalysisResultsComponent', () => {
  async function setup(
    options: {
      uploadId?: string | null;
      analysis?: ExamAnalysisSummary | null;
      includeRouteId?: boolean;
    } = {},
  ) {
    const hasAnalysisOverride = Object.prototype.hasOwnProperty.call(options, 'analysis');
    const mockService = {
      getExamAnalysis: vi
        .fn()
        .mockResolvedValue(hasAnalysisOverride ? options.analysis : STUB_ANALYSIS),
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

  it('loads and renders analysis data with headline', async () => {
    const { fixture } = await setup();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Topic Summary');
    expect(el.textContent).toContain('Algebra');
    expect(el.textContent).toContain('Geometry');
    expect(el.textContent).toContain('Trigonometry');
    expect(el.textContent).toContain('You performed well in Algebra.');
  });

  it('shows error for invalid upload id', async () => {
    const { fixture } = await setup({ uploadId: null });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Missing or invalid upload ID.');
  });

  it('shows error message when analysis is null', async () => {
    const { fixture } = await setup({ analysis: null });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Something went wrong processing your exam.');
  });

  it('shows empty-state messages when analysis arrays are empty', async () => {
    const { fixture } = await setup({
      analysis: {
        headline: '',
        overall_score_pct: 0,
        strengths: [],
        weaknesses: [],
        needs_review: [],
      },
    });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('No topic summary available.');
    expect(el.textContent).toContain('No strengths identified.');
    expect(el.textContent).toContain('No weaknesses identified.');
    expect(el.textContent).toContain('No topics currently marked for review.');
  });

  it('renders topic labels from TopicSummaryLine objects', async () => {
    const { fixture } = await setup();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Algebra (strong)');
    expect(el.textContent).toContain('Geometry (weak)');
    expect(el.textContent).toContain('Trigonometry (needs review)');
  });

  it('falls back to NaN course id when route chain has no course id', async () => {
    const { fixture, mockService } = await setup({ includeRouteId: false });
    const component = fixture.componentInstance;

    expect(component['courseId']).toBeNaN();
    expect(mockService.getExamAnalysis).toHaveBeenCalledWith(Number.NaN, 22);
  });

  it('shows no headline card when headline is empty', async () => {
    const { fixture } = await setup({
      analysis: {
        headline: '',
        overall_score_pct: 0.5,
        strengths: [
          { label: 'Math (strong)', topic: 'Math', performance: 'strong', average_score_pct: 0.9 },
        ],
        weaknesses: [],
        needs_review: [],
      },
    });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.headline-card')).toBeNull();
  });
});
