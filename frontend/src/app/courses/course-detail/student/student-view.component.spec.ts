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

  it('uses cached analysis and skips network fetch', async () => {
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

    expect(gradingAnalyzerService.getLatestAnalysis).not.toHaveBeenCalled();
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

  it('falls back to refreshLatestAnalysis when uploadId polling returns null', async () => {
    const refreshedAnalysis: ExamAnalysisSummary = {
      headline: 'Refreshed from getLatestAnalysis',
      overall_score_pct: 0.85,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };

    const { fixture, gradingAnalyzerService } = await setup({
      uploadId: '42',
      pollAnalysis: null,
      latestAnalysis: refreshedAnalysis,
    });

    expect(gradingAnalyzerService.getExamAnalysis).toHaveBeenCalledWith(1, 42);
    expect(gradingAnalyzerService.getLatestAnalysis).toHaveBeenCalledWith(1);
    expect(fixture.nativeElement.textContent).toContain('Refreshed from getLatestAnalysis');
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
});
