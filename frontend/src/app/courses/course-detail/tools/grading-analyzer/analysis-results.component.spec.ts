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
import { PracticeService } from '../practice.service';
import { Router } from '@angular/router';
import { Provider } from '@angular/core';
import { StudentDashboardStateService } from '../../student/student-dashboard-state.service';

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
      pathFromRoot?: { routeConfig?: { path: string } }[];
      extraProviders?: Provider[];
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
        pathFromRoot: options.pathFromRoot ?? [],
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
        ...(options.extraProviders ?? []),
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

  it('uses cached analysis when polling fails', async () => {
    const cachedAnalysis: ExamAnalysisSummary = {
      headline: 'Cached result headline',
      overall_score_pct: 0.85,
      strengths: [
        {
          label: 'Algebra (strong)',
          topic: 'Algebra',
          performance: 'strong',
          average_score_pct: 0.95,
        },
      ],
      weaknesses: [],
      needs_review: [],
    };

    const dashboardStateService = {
      getCachedAnalysis: vi.fn().mockReturnValue({ uploadId: 22, analysis: cachedAnalysis }),
    };

    const { fixture } = await setup({
      analysis: null,
      extraProviders: [{ provide: StudentDashboardStateService, useValue: dashboardStateService }],
    });

    const el: HTMLElement = fixture.nativeElement;

    // Should render cached data instead of error
    expect(el.textContent).toContain('Cached result headline');
    expect(el.textContent).toContain('Algebra');
    expect(el.textContent).not.toContain('Something went wrong');
  });

  it('does not use cached analysis for a different upload', async () => {
    const dashboardStateService = {
      getCachedAnalysis: vi.fn().mockReturnValue({
        uploadId: 99,
        analysis: {
          headline: 'Wrong cached headline',
          overall_score_pct: 0.85,
          strengths: [],
          weaknesses: [],
          needs_review: [],
        },
      }),
    };

    const { fixture } = await setup({
      analysis: null,
      extraProviders: [{ provide: StudentDashboardStateService, useValue: dashboardStateService }],
    });

    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).not.toContain('Wrong cached headline');
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

  describe('Generate Practice Materials button', () => {
    const defaultPracticeProviders = (
      overrides: {
        generatePractice?: ReturnType<typeof vi.fn>;
        getPractice?: ReturnType<typeof vi.fn>;
        navigate?: ReturnType<typeof vi.fn>;
      } = {},
    ) => {
      const practiceServiceMock = {
        generatePractice:
          overrides.generatePractice ?? vi.fn().mockResolvedValue({ job_id: 1, status: 'pending' }),
        getPractice:
          overrides.getPractice ??
          vi.fn().mockResolvedValue({ id: 5, course_id: 1, upload_id: 42 }),
      };
      const routerMock = {
        navigate: overrides.navigate ?? vi.fn().mockResolvedValue(true),
      };
      return {
        practiceServiceMock,
        routerMock,
        providers: [
          { provide: PracticeService, useValue: practiceServiceMock },
          { provide: Router, useValue: routerMock },
        ] satisfies Provider[],
      };
    };

    it('should not show button while exam results are loading', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['loading'].set(true);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="generate-practice-btn"]'),
      ).toBeNull();
    });

    it('should show button once results have loaded', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['loading'].set(false);
      component['uploadId'].set(42);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="generate-practice-btn"]'),
      ).not.toBeNull();
    });

    it('should call generatePractice with courseId and uploadId on click', async () => {
      const { practiceServiceMock, providers } = defaultPracticeProviders();
      const { fixture } = await setup({ extraProviders: providers });
      const component = fixture.componentInstance;

      component['loading'].set(false);
      component['uploadId'].set(42);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('[data-testid="generate-practice-btn"]').click();
      await fixture.whenStable();

      expect(practiceServiceMock.generatePractice).toHaveBeenCalledWith(component['courseId'], 42);
    });

    it('should show spinner while generating', async () => {
      const { providers } = defaultPracticeProviders({
        generatePractice: vi.fn().mockReturnValue(new Promise(() => {})),
      });
      const { fixture } = await setup({ extraProviders: providers });
      const component = fixture.componentInstance;

      component['loading'].set(false);
      component['uploadId'].set(42);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('[data-testid="generate-practice-btn"]').click();
      fixture.detectChanges();

      expect(component['generatingPractice']()).toBe(true);
      expect(fixture.nativeElement.querySelector('mat-spinner')).not.toBeNull();
    });

    it('should hide spinner after completion', async () => {
      const { providers } = defaultPracticeProviders();
      const { fixture } = await setup({ extraProviders: providers });
      const component = fixture.componentInstance;

      component['loading'].set(false);
      component['uploadId'].set(42);
      fixture.detectChanges();

      await component['onGeneratePractice']();

      expect(component['generatingPractice']()).toBe(false);
    });

    it('should navigate to practice page on success', async () => {
      const { routerMock, providers } = defaultPracticeProviders();
      const { fixture } = await setup({ extraProviders: providers });
      const component = fixture.componentInstance;

      component['uploadId'].set(42);
      await component['onGeneratePractice']();

      expect(routerMock.navigate).toHaveBeenCalledWith(
        expect.arrayContaining(['practice']),
        expect.objectContaining({ queryParams: { uploadId: 42 } }),
      );
    });

    it('should show error message when generation fails', async () => {
      const { providers } = defaultPracticeProviders({
        generatePractice: vi.fn().mockRejectedValue(new Error('network error')),
      });
      const { fixture } = await setup({ extraProviders: providers });
      const component = fixture.componentInstance;

      component['loading'].set(false);
      component['uploadId'].set(42);
      fixture.detectChanges();

      await component['onGeneratePractice']();
      fixture.detectChanges();

      expect(component['practiceError']()).toContain('try again');
      expect(fixture.nativeElement.querySelector('.practice-error')).not.toBeNull();
    });

    it('should show error if navigation fails after generation', async () => {
      const { providers } = defaultPracticeProviders({
        navigate: vi.fn().mockResolvedValue(false),
      });
      const { fixture } = await setup({ extraProviders: providers });
      const component = fixture.componentInstance;

      component['loading'].set(false);
      component['uploadId'].set(42);
      fixture.detectChanges();

      await component['onGeneratePractice']();
      fixture.detectChanges();

      expect(component['practiceError']()).toContain('Please refresh');
    });

    it('should do nothing when uploadId is null', async () => {
      const { providers, practiceServiceMock } = defaultPracticeProviders();
      const { fixture } = await setup({ extraProviders: providers });
      const component = fixture.componentInstance;

      // Force uploadId back to null (ngOnInit sets it from route params)
      component['uploadId'].set(null);
      await component['onGeneratePractice']();

      expect(practiceServiceMock.generatePractice).not.toHaveBeenCalled();
    });

    it('should navigate to student practice path when on student route', async () => {
      const { routerMock, providers } = defaultPracticeProviders();
      const { fixture } = await setup({
        extraProviders: providers,
        pathFromRoot: [{ routeConfig: { path: 'student' } }, { routeConfig: undefined }],
      });
      const component = fixture.componentInstance;

      component['uploadId'].set(42);
      await component['onGeneratePractice']();

      expect(routerMock.navigate).toHaveBeenCalledWith(
        expect.arrayContaining(['student', 'tools', 'grading-analyzer', 'practice']),
        expect.objectContaining({ queryParams: { uploadId: 42 } }),
      );
    });

    it('should throw and set error when poll times out', async () => {
      const { providers } = defaultPracticeProviders({
        getPractice: vi.fn().mockResolvedValue({ id: null }),
      });
      const { fixture } = await setup({ extraProviders: providers });
      const component = fixture.componentInstance;

      component['loading'].set(false);
      component['uploadId'].set(42);

      // Call pollUntilComplete directly with maxAttempts=1, intervalMs=0 to trigger timeout
      await expect(component['pollUntilComplete'](42, 0, 1)).rejects.toThrow('Timed out');
    });
  });
});
