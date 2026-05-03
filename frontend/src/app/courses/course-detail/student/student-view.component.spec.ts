/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { signal, type Signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { PageTitleService } from '../../../page-title.service';
import { JobUpdateService, type JobUpdate } from '../../../job-update.service';
import { LayoutNavigationService } from '../../../layout/layout-navigation.service';
import { GradingAnalyzerService } from '../tools/grading-analyzer.service';
import { StudentDashboardStateService } from './student-dashboard-state.service';
import { StudentView, POLL_CONFIG } from './student-view.component';
import type { ExamAnalysisSummary } from '../../../api/generated/models/exam-analysis-summary';

const flush = () => new Promise((resolve) => setTimeout(resolve));

type SetupOptions = {
  courseId?: string | null;
  uploadId?: string | null;
  latestAnalysis?: ExamAnalysisSummary | null;
  pollAnalysis?: ExamAnalysisSummary | null;
  cachedAnalysis?: ExamAnalysisSummary | null;
};

describe('StudentView', () => {
  async function setup(options: SetupOptions = {}) {
    const pageTitle = { setTitle: vi.fn() };
    const layoutNavigation = { clearContext: vi.fn() };

    const gradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(options.latestAnalysis ?? null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(options.pollAnalysis ?? null)),
    };

    const updatesSignal: WritableSignal<ReadonlyMap<number, JobUpdate>> = signal(new Map());
    const jobUpdateService = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      updatesForCourse: vi.fn(
        () => updatesSignal.asReadonly() as Signal<ReadonlyMap<number, JobUpdate>>,
      ),
    };

    const route = {
      snapshot: {
        queryParamMap: new Map(options.uploadId != null ? [['uploadId', options.uploadId]] : []),
      },
      parent:
        options.courseId === null
          ? null
          : { snapshot: { paramMap: new Map([['id', options.courseId ?? '1']]) } },
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: pageTitle },
        { provide: LayoutNavigationService, useValue: layoutNavigation },
        { provide: GradingAnalyzerService, useValue: gradingAnalyzerService },
        { provide: JobUpdateService, useValue: jobUpdateService },
        { provide: ActivatedRoute, useValue: route },
        // Use a single-attempt, zero-delay poll config so tests resolve immediately
        { provide: POLL_CONFIG, useValue: { intervalMs: 0, maxAttempts: 1 } },
      ],
    });

    if (options.cachedAnalysis != null) {
      const stateService = TestBed.inject(StudentDashboardStateService);
      stateService.setAnalysis(1, options.cachedAnalysis);
    }

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    return {
      fixture,
      pageTitle,
      layoutNavigation,
      gradingAnalyzerService,
      jobUpdateService,
      updatesSignal,
    };
  }

  it('renders exam-analysis-only dashboard copy and latest exam score', async () => {
    const analysis: ExamAnalysisSummary = {
      headline: 'Latest exam shows strong algebra performance.',
      overall_score_pct: 0.88,
      strengths: [
        {
          label: 'Algebra (strong)',
          topic: 'Algebra',
          performance: 'strong',
          average_score_pct: 0.9,
        },
      ],
      needs_review: [],
      weaknesses: [
        {
          label: 'Geometry (weak)',
          topic: 'Geometry',
          performance: 'weak',
          average_score_pct: 0.55,
        },
      ],
    };

    const { fixture, pageTitle, layoutNavigation } = await setup({ latestAnalysis: analysis });

    expect(layoutNavigation.clearContext).toHaveBeenCalled();
    expect(pageTitle.setTitle).toHaveBeenCalledWith('Student Dashboard');

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Exam insights');
    expect(text).toContain('Latest uploaded exam analysis');
    expect(text).toContain('Latest exam score');
    expect(text).toContain('88%');
    expect(text).toContain('Algebra');
    expect(text).toContain('Geometry');
    expect(text).not.toContain('Topics analyzed');
    expect(text).not.toContain('Completion rate');
    expect(text).not.toContain('Feedback coverage');
    expect(text).not.toContain('submission');
  });

  it('shows 0% score when no analyzed exam exists', async () => {
    const { fixture } = await setup({ latestAnalysis: null });

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Latest exam score');
    expect(text).toContain('0%');
    expect(text).toContain('No analyzed exam data is available yet.');
  });

  it('hides headline subtitle when analysis has empty headline', async () => {
    const analysis: ExamAnalysisSummary = {
      headline: '',
      overall_score_pct: 0.75,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };
    const { fixture } = await setup({ latestAnalysis: analysis });

    // The @if (examAnalysis()!.headline) block should not render when headline is empty
    // The "Latest Exam Analysis" card has a mat-card-header; no subtitle should be inside it
    const allCards = Array.from(
      fixture.nativeElement.querySelectorAll('mat-card') as NodeListOf<HTMLElement>,
    );
    const analysisCard = allCards.find((card) =>
      card.textContent?.includes('Latest Exam Analysis'),
    );
    expect(analysisCard?.querySelector('mat-card-subtitle')).toBeNull();
  });

  it('shows an error when course id is missing', async () => {
    const { fixture, jobUpdateService } = await setup({ courseId: null });

    expect(fixture.nativeElement.textContent).toContain('Failed to determine the current course.');
    expect(jobUpdateService.subscribe).not.toHaveBeenCalled();
  });

  it('polls for analysis when uploadId query param is present', async () => {
    const analysis: ExamAnalysisSummary = {
      headline: 'Freshly analyzed upload',
      overall_score_pct: 0.9,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    const { fixture, gradingAnalyzerService } = await setup({
      uploadId: '42',
      pollAnalysis: analysis,
      latestAnalysis: null,
    });

    expect(gradingAnalyzerService.getExamAnalysis).toHaveBeenCalledWith(1, 42);
    expect(gradingAnalyzerService.getLatestAnalysis).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Freshly analyzed upload');
  });

  it('uses cached analysis optimistically and still refreshes from network', async () => {
    const cachedAnalysis: ExamAnalysisSummary = {
      headline: 'Cached exam analysis',
      overall_score_pct: 0.75,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    const { fixture, gradingAnalyzerService } = await setup({
      cachedAnalysis,
      latestAnalysis: null,
    });

    // Network always refreshed (latestAnalysis=null means no update applied)
    expect(gradingAnalyzerService.getLatestAnalysis).toHaveBeenCalledWith(1);
    // Cached data is still displayed because network returned null
    expect(fixture.nativeElement.textContent).toContain('Cached exam analysis');
  });

  it('stores network analysis in dashboard state service', async () => {
    const analysis: ExamAnalysisSummary = {
      headline: 'Network analysis',
      overall_score_pct: 0.62,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    await setup({ latestAnalysis: analysis });

    const stateService = TestBed.inject(StudentDashboardStateService);
    expect(stateService.getAnalysis(1)).toEqual(analysis);
  });

  it('stores analysis by upload id when polling succeeds for a specific upload', async () => {
    const analysis: ExamAnalysisSummary = {
      headline: 'Upload-specific analysis',
      overall_score_pct: 0.9,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    await setup({ uploadId: '42', pollAnalysis: analysis });

    const stateService = TestBed.inject(StudentDashboardStateService);
    expect(stateService.getAnalysisByUploadId(42)).toEqual(analysis);
  });

  it('refreshes dashboard when an exam analysis job completes', async () => {
    const refreshAnalysis: ExamAnalysisSummary = {
      headline: 'Updated from realtime completion',
      overall_score_pct: 0.94,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    const { fixture, gradingAnalyzerService, updatesSignal } = await setup({
      latestAnalysis: null,
    });

    // Replace the mock implementation mid-test to return refreshAnalysis on next call
    gradingAnalyzerService.getLatestAnalysis.mockResolvedValueOnce(refreshAnalysis);

    updatesSignal.set(
      new Map([
        [
          77,
          {
            job_id: 77,
            course_id: 1,
            user_id: 111111111,
            kind: 'exam_analysis',
            status: 'completed',
          },
        ],
      ]),
    );

    await flush();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Updated from realtime completion');
  });

  it('subscribes and unsubscribes job updates for the course', async () => {
    const { fixture, jobUpdateService } = await setup();

    expect(jobUpdateService.subscribe).toHaveBeenCalledWith(1);

    fixture.destroy();

    expect(jobUpdateService.unsubscribe).toHaveBeenCalledWith(1);
  });

  it('always refreshes from network even when cache has stale data', async () => {
    const cachedAnalysis: ExamAnalysisSummary = {
      headline: 'Old cached analysis',
      overall_score_pct: 0.5,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };
    const freshAnalysis: ExamAnalysisSummary = {
      headline: 'Fresh network analysis',
      overall_score_pct: 0.82,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    const { fixture, gradingAnalyzerService } = await setup({
      cachedAnalysis,
      latestAnalysis: freshAnalysis,
    });

    expect(gradingAnalyzerService.getLatestAnalysis).toHaveBeenCalledWith(1);
    // Fresh data from network replaces the stale cache
    expect(fixture.nativeElement.textContent).toContain('Fresh network analysis');
    expect(fixture.nativeElement.textContent).not.toContain('Old cached analysis');
  });

  it('does not fall back to getLatestAnalysis when uploadId polling returns null', async () => {
    const { gradingAnalyzerService } = await setup({
      uploadId: '42',
      pollAnalysis: null,
      latestAnalysis: null,
    });

    expect(gradingAnalyzerService.getExamAnalysis).toHaveBeenCalledWith(1, 42);
    // Should NOT call getLatestAnalysis — showing a different exam's stale analysis
    // when a specific upload was just made would be misleading.
    expect(gradingAnalyzerService.getLatestAnalysis).not.toHaveBeenCalled();
  });

  it('calls refreshLatestAnalysis when no uploadId and no cache exists', async () => {
    const refreshedAnalysis: ExamAnalysisSummary = {
      headline: 'Analysis from getLatestAnalysis',
      overall_score_pct: 0.79,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    const { fixture, gradingAnalyzerService } = await setup({
      latestAnalysis: refreshedAnalysis,
    });

    expect(gradingAnalyzerService.getLatestAnalysis).toHaveBeenCalledWith(1);
    expect(fixture.nativeElement.textContent).toContain('Analysis from getLatestAnalysis');
  });

  it('ignores job updates that are not completed exam_analysis kind', async () => {
    const { fixture, gradingAnalyzerService, updatesSignal } = await setup({
      latestAnalysis: null,
    });

    gradingAnalyzerService.getLatestAnalysis.mockClear();

    // Fire an update that is NOT a completed exam_analysis — should not trigger refresh
    updatesSignal.set(
      new Map([
        [
          88,
          {
            job_id: 88,
            course_id: 1,
            user_id: 111111111,
            kind: 'exam_analysis',
            status: 'pending',
          },
        ],
      ]),
    );

    await flush();
    fixture.detectChanges();

    expect(gradingAnalyzerService.getLatestAnalysis).not.toHaveBeenCalled();
  });

  it('ignores duplicate completed job updates already tracked', async () => {
    const refreshAnalysis: ExamAnalysisSummary = {
      headline: 'First refresh',
      overall_score_pct: 0.94,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    const { fixture, gradingAnalyzerService, updatesSignal } = await setup({
      latestAnalysis: null,
    });

    gradingAnalyzerService.getLatestAnalysis.mockResolvedValue(refreshAnalysis);

    const update = {
      job_id: 99,
      course_id: 1,
      user_id: 111111111,
      kind: 'exam_analysis' as const,
      status: 'completed' as const,
    };

    // First trigger — should refresh
    updatesSignal.set(new Map([[99, update]]));
    await flush();
    await flush();
    fixture.detectChanges();

    const callsAfterFirst = gradingAnalyzerService.getLatestAnalysis.mock.calls.length;

    // Same job id again — should NOT refresh again (already tracked)
    updatesSignal.set(new Map([[99, update]]));
    await flush();
    await flush();
    fixture.detectChanges();

    expect(gradingAnalyzerService.getLatestAnalysis.mock.calls.length).toBe(callsAfterFirst);
  });

  it('uses the default POLL_CONFIG factory when no override is provided', () => {
    // Instantiate without a custom POLL_CONFIG so the default factory runs
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: { setTitle: vi.fn() } },
        { provide: LayoutNavigationService, useValue: { clearContext: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: new Map() },
            parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
          },
        },
        {
          provide: GradingAnalyzerService,
          useValue: { getLatestAnalysis: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: JobUpdateService,
          useValue: {
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
            updatesForCourse: vi.fn(() => signal(new Map()).asReadonly()),
          },
        },
        // No POLL_CONFIG override — exercises the default factory
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    // If the factory ran correctly, the component creates without throwing
    expect(fixture).toBeTruthy();
  });

  it('shows loading progress bar via analysisLoading signal', async () => {
    const { fixture } = await setup({ uploadId: '42', pollAnalysis: null });

    // Manually trigger loading to cover the @if (loading()) branch in the template
    // loading signal starts false and is never set by the component, so we set it directly.

    const instance = fixture.componentInstance as unknown as {
      loading: { set: (v: boolean) => void };
    };
    instance.loading.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('mat-progress-bar')).not.toBeNull();
  });

  it('examAnalysisTopics returns empty array when examAnalysis is null', async () => {
    const { fixture } = await setup({ latestAnalysis: null });

    // examAnalysis() is null → examAnalysisTopics() should return []
    const instance = fixture.componentInstance as unknown as {
      examAnalysisTopics: () => unknown[];
      applyAnalysis: (analysis: null) => void;
      topics: () => unknown[];
    };
    expect(instance.examAnalysisTopics()).toEqual([]);

    // Also cover the applyAnalysis(null) path to hit the ternary false branch
    instance.applyAnalysis(null);
    expect(instance.topics()).toEqual([]);
  });
});
