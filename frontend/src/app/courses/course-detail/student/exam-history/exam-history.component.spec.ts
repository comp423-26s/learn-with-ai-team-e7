/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamHistory } from './exam-history.component';
import { PageTitleService } from '../../../../page-title.service';
import { LayoutNavigationService } from '../../../../layout/layout-navigation.service';
import { GradingAnalyzerService } from '../../tools/grading-analyzer.service';
import { AuthService } from '../../../../auth.service';
import { StudentDashboardStateService } from '../student-dashboard-state.service';
import { Api } from '../../../../api/generated/api';
import { ExamPdfHistoryItem } from '../../../../api/generated/models';
import { vi } from 'vitest';

type ApiStub = {
  invoke: ReturnType<typeof vi.fn>;
};

type GradingAnalyzerStub = {
  getExamAnalysis: ReturnType<typeof vi.fn>;
};

type RouterStub = { navigate: ReturnType<typeof vi.fn> };

type AuthServiceStub = {
  user: ReturnType<typeof vi.fn>;
};

type DashboardStateStub = {
  setAnalysis: ReturnType<typeof vi.fn>;
  getAnalysis: ReturnType<typeof vi.fn>;
};

const defaultUser = {
  given_name: 'Jane',
  family_name: 'Smith',
  onyen: 'jsmith',
  pid: 730000001,
  email: 'jsmith@test.edu',
  name: 'Jane Smith',
};

type ExamHistoryTestInstance = {
  loading: () => boolean;
  navigateToGradingAnalyzer: () => void;
  pendingUploadId: () => number | null;
  pollEntryForAnalysis: (
    uploadId: number,
    intervalMs?: number,
    maxAttempts?: number,
  ) => Promise<void>;
};

const makeRoute = (id: string, uploadId?: string) => ({
  parent: {
    parent: { snapshot: { paramMap: new Map([['id', id]]) } },
  },
  snapshot: {
    queryParamMap: new Map(uploadId !== undefined ? [['uploadId', uploadId]] : []),
  },
});

const waitForHistoryLoad = async (fixture: ComponentFixture<ExamHistory>): Promise<void> => {
  const instance = fixture.componentInstance as unknown as ExamHistoryTestInstance;

  for (let i = 0; i < 100; i += 1) {
    if (!instance.loading()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
};

const waitForPendingClear = async (fixture: ComponentFixture<ExamHistory>): Promise<void> => {
  const instance = fixture.componentInstance as unknown as ExamHistoryTestInstance;

  for (let i = 0; i < 100; i += 1) {
    if (instance.pendingUploadId() === null) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
};

const configureModule = async (
  routeId: string,
  userOverride?: typeof defaultUser | null,
  uploadId?: string,
) => {
  const pageTitle = { setTitle: vi.fn() };
  const layoutNav = { clearContext: vi.fn() };
  const router: RouterStub = { navigate: vi.fn() };
  const api: ApiStub = { invoke: vi.fn() };
  const gradingAnalyzer: GradingAnalyzerStub = { getExamAnalysis: vi.fn() };
  const authService: AuthServiceStub = {
    user: vi.fn().mockReturnValue(userOverride !== undefined ? userOverride : defaultUser),
  };
  const dashboardState: DashboardStateStub = {
    setAnalysis: vi.fn(),
    getAnalysis: vi.fn().mockReturnValue(undefined),
  };

  await TestBed.configureTestingModule({
    imports: [ExamHistory],
    providers: [
      { provide: PageTitleService, useValue: pageTitle },
      { provide: LayoutNavigationService, useValue: layoutNav },
      { provide: ActivatedRoute, useValue: makeRoute(routeId, uploadId) },
      { provide: Router, useValue: router },
      { provide: Api, useValue: api },
      { provide: GradingAnalyzerService, useValue: gradingAnalyzer },
      { provide: AuthService, useValue: authService },
      { provide: StudentDashboardStateService, useValue: dashboardState },
    ],
  }).compileComponents();

  return { pageTitle, layoutNav, router, api, gradingAnalyzer, authService, dashboardState };
};

describe('ExamHistory', () => {
  describe('with a valid course id', () => {
    let fixture: ComponentFixture<ExamHistory>;
    let mockApi: ApiStub;
    let mockRouter: RouterStub;
    let mockGradingAnalyzer: GradingAnalyzerStub;
    let titleService: PageTitleService;
    let navService: LayoutNavigationService;

    beforeEach(async () => {
      const stubs = await configureModule('1');
      mockApi = stubs.api;
      mockRouter = stubs.router;
      mockGradingAnalyzer = stubs.gradingAnalyzer;
      titleService = TestBed.inject(PageTitleService);
      navService = TestBed.inject(LayoutNavigationService);
    });

    it('should set the page title and render upload cards', async () => {
      const mockUploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'exam1.pdf',
          uploaded_at: '2026-04-15T00:00:00Z',
          has_analysis: true,
          has_practice: false,
        },
        {
          id: 2,
          original_filename: 'exam2.pdf',
          uploaded_at: '2026-04-20T00:00:00Z',
          has_analysis: false,
          has_practice: true,
        },
      ];

      mockApi.invoke.mockResolvedValue(mockUploads);
      mockGradingAnalyzer.getExamAnalysis.mockResolvedValue(null);

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(titleService.setTitle).toHaveBeenCalledWith('My Exam History');
      expect(navService.clearContext).toHaveBeenCalled();

      const cards = fixture.nativeElement.querySelectorAll('mat-card.entry-card');
      expect(cards.length).toBe(2);
      expect(fixture.nativeElement.textContent).toContain('exam1.pdf');
      expect(fixture.nativeElement.textContent).toContain('exam2.pdf');
    });

    it('should render empty state when no uploads', async () => {
      mockApi.invoke.mockResolvedValue([]);

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("You haven't uploaded any exams yet");
    });

    it('should render analysis data inline when analysis is available', async () => {
      const mockUploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'exam1.pdf',
          uploaded_at: '2026-04-15T00:00:00Z',
          has_analysis: true,
          has_practice: false,
        },
      ];

      mockApi.invoke.mockResolvedValue(mockUploads);
      mockGradingAnalyzer.getExamAnalysis.mockResolvedValue({
        headline: 'You did great in Algebra!',
        overall_score_pct: 0.82,
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
            average_score_pct: 0.6,
          },
        ],
      });

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('You did great in Algebra!');
      expect(text).toContain('82%');
      expect(text).toContain('Algebra');
      expect(text).toContain('Geometry');
    });

    it('should render analysis and practice action links correctly', async () => {
      const mockUploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'exam1.pdf',
          uploaded_at: '2026-04-15T00:00:00Z',
          has_analysis: true,
          has_practice: true,
        },
      ];

      mockApi.invoke.mockResolvedValue(mockUploads);
      mockGradingAnalyzer.getExamAnalysis.mockResolvedValue(null);

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('View Analysis');
      expect(text).toContain('Practice Materials');
    });

    it('should show "not yet available" message when upload has no analysis', async () => {
      const mockUploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'pending.pdf',
          uploaded_at: '2026-04-15T00:00:00Z',
          has_analysis: false,
          has_practice: false,
        },
      ];

      mockApi.invoke.mockResolvedValue(mockUploads);

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Analysis not yet available');
    });

    it('should call getExamAnalysis for uploads with has_analysis true', async () => {
      const mockUploads: ExamPdfHistoryItem[] = [
        {
          id: 5,
          original_filename: 'exam5.pdf',
          uploaded_at: '2026-04-15T00:00:00Z',
          has_analysis: true,
          has_practice: false,
        },
        {
          id: 6,
          original_filename: 'exam6.pdf',
          uploaded_at: '2026-04-16T00:00:00Z',
          has_analysis: false,
          has_practice: false,
        },
      ];

      mockApi.invoke.mockResolvedValue(mockUploads);
      mockGradingAnalyzer.getExamAnalysis.mockResolvedValue(null);

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(mockGradingAnalyzer.getExamAnalysis).toHaveBeenCalledWith(1, 5);
      expect(mockGradingAnalyzer.getExamAnalysis).not.toHaveBeenCalledWith(1, 6);
    });

    it('should show progress bar while loading', () => {
      mockApi.invoke.mockReturnValue(new Promise(() => undefined));

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();

      const progressBar = fixture.nativeElement.querySelector('mat-progress-bar');
      expect(progressBar).not.toBeNull();
    });

    it('should show error message when api call fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockApi.invoke.mockRejectedValue(new Error('network error'));

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'Failed to load your exam history. Please try again.',
      );
    });

    it('should show only weaknesses section when analysis has no strengths', async () => {
      const mockUploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'exam1.pdf',
          uploaded_at: '2026-04-15T00:00:00Z',
          has_analysis: true,
          has_practice: false,
        },
      ];

      mockApi.invoke.mockResolvedValue(mockUploads);
      mockGradingAnalyzer.getExamAnalysis.mockResolvedValue({
        headline: 'Needs improvement',
        overall_score_pct: 0.45,
        strengths: [],
        needs_review: [
          {
            label: 'Calc (review)',
            topic: 'Calculus',
            performance: 'needs_review' as const,
            average_score_pct: 0.5,
          },
        ],
        weaknesses: [],
      });

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      // No strengths section since strengths is empty
      expect(text).not.toContain('Strengths:');
      // Needs Review section should appear
      expect(text).toContain('Needs Review:');
      expect(text).toContain('Calculus');
    });

    it('should show only strengths section when analysis has no weaknesses or needs_review', async () => {
      const mockUploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'exam1.pdf',
          uploaded_at: '2026-04-15T00:00:00Z',
          has_analysis: true,
          has_practice: false,
        },
      ];

      mockApi.invoke.mockResolvedValue(mockUploads);
      mockGradingAnalyzer.getExamAnalysis.mockResolvedValue({
        headline: 'All good!',
        overall_score_pct: 0.98,
        strengths: [
          {
            label: 'Math (strong)',
            topic: 'Math',
            performance: 'strong' as const,
            average_score_pct: 0.98,
          },
        ],
        needs_review: [],
        weaknesses: [],
      });

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Strengths:');
      // No needs-review or weaknesses sections since both are empty
      expect(text).not.toContain('Needs Review:');
      expect(text).not.toContain('Weaknesses:');
    });

    it('should navigate to grading analyzer via button click', async () => {
      mockApi.invoke.mockResolvedValue([]);

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button[mat-flat-button]');
      button.click();
      fixture.detectChanges();

      expect(mockRouter.navigate).toHaveBeenCalledWith([
        'courses',
        1,
        'student',
        'tools',
        'grading-analyzer',
      ]);
    });

    it('should navigate to grading analyzer', async () => {
      mockApi.invoke.mockResolvedValue([]);

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      (fixture.componentInstance as unknown as ExamHistoryTestInstance).navigateToGradingAnalyzer();

      expect(mockRouter.navigate).toHaveBeenCalledWith([
        'courses',
        1,
        'student',
        'tools',
        'grading-analyzer',
      ]);
    });
  });

  describe('polling for new upload analysis', () => {
    it('should show processing indicator then update entry when polling finds analysis', async () => {
      const stubs = await configureModule('1', undefined, '1');
      const uploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'new-exam.pdf',
          uploaded_at: '2026-04-28T00:00:00Z',
          has_analysis: false,
          has_practice: false,
        },
      ];
      stubs.api.invoke.mockResolvedValue(uploads);

      const mockAnalysis = {
        headline: 'Good job!',
        overall_score_pct: 0.88,
        strengths: [
          {
            label: 'Algebra (strong)',
            topic: 'Algebra',
            performance: 'strong' as const,
            average_score_pct: 0.88,
          },
        ],
        needs_review: [],
        weaknesses: [],
      };

      // Deferred promise: keeps polling suspended until we explicitly resolve it,
      // allowing the test to observe the "processing" state before analysis arrives.
      let resolveAnalysis!: (value: typeof mockAnalysis) => void;
      const analysisPromise = new Promise<typeof mockAnalysis>((resolve) => {
        resolveAnalysis = resolve;
      });
      stubs.gradingAnalyzer.getExamAnalysis.mockReturnValue(analysisPromise);

      const fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      // Polling is still pending — processing indicator should be visible
      expect(fixture.nativeElement.textContent).toContain('Analyzing your exam');

      // Now deliver the analysis and wait for polling to complete
      resolveAnalysis(mockAnalysis);
      await waitForPendingClear(fixture);
      fixture.detectChanges();

      // Analysis is now shown and processing indicator is gone
      expect(fixture.nativeElement.textContent).toContain('Good job!');
      expect(fixture.nativeElement.textContent).not.toContain('Analyzing your exam');
      expect(stubs.dashboardState.setAnalysis).toHaveBeenCalledWith(1, mockAnalysis);
    });

    it('should not poll when upload already has analysis', async () => {
      const stubs = await configureModule('1', undefined, '1');
      const uploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'done.pdf',
          uploaded_at: '2026-04-28T00:00:00Z',
          has_analysis: true,
          has_practice: false,
        },
      ];
      stubs.api.invoke.mockResolvedValue(uploads);
      stubs.gradingAnalyzer.getExamAnalysis
        .mockResolvedValueOnce(null) // called during initial load for has_analysis:true entry
        .mockResolvedValue(null); // any further calls return null

      const fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      // pendingUploadId should be null — polling never started
      const instance = fixture.componentInstance as unknown as ExamHistoryTestInstance;
      expect(instance.pendingUploadId()).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Analyzing your exam');
    });

    it('should stop showing processing indicator when polling exhausts max attempts', async () => {
      const stubs = await configureModule('1', undefined, '5');
      const uploads: ExamPdfHistoryItem[] = [
        {
          id: 5,
          original_filename: 'slow.pdf',
          uploaded_at: '2026-04-28T00:00:00Z',
          has_analysis: false,
          has_practice: false,
        },
      ];
      stubs.api.invoke.mockResolvedValue(uploads);
      stubs.gradingAnalyzer.getExamAnalysis.mockResolvedValue(null);

      const fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const instance = fixture.componentInstance as unknown as ExamHistoryTestInstance;
      // Run poll with 1 attempt and 0ms interval so it exhausts immediately
      await instance.pollEntryForAnalysis(5, 0, 1);
      fixture.detectChanges();

      expect(instance.pendingUploadId()).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Analyzing your exam');
      expect(fixture.nativeElement.textContent).toContain('Analysis not yet available');
    });

    it('should not start polling when no uploadId query param is present', async () => {
      const stubs = await configureModule('1'); // no uploadId
      const uploads: ExamPdfHistoryItem[] = [
        {
          id: 2,
          original_filename: 'old.pdf',
          uploaded_at: '2026-04-20T00:00:00Z',
          has_analysis: false,
          has_practice: false,
        },
      ];
      stubs.api.invoke.mockResolvedValue(uploads);

      const fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const instance = fixture.componentInstance as unknown as ExamHistoryTestInstance;
      expect(instance.pendingUploadId()).toBeNull();
      // getExamAnalysis should not have been called (no has_analysis uploads, no polling)
      expect(stubs.gradingAnalyzer.getExamAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('with an invalid course id', () => {
    let fixture: ComponentFixture<ExamHistory>;

    beforeEach(async () => {
      await configureModule('not-a-number');
    });

    it('should show an error when course id cannot be parsed', async () => {
      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Failed to determine');
    });
  });

  describe('when user is null', () => {
    it('should not show student info banner when user is null', async () => {
      const stubs = await configureModule('1', null);
      const uploads: ExamPdfHistoryItem[] = [
        {
          id: 1,
          original_filename: 'exam.pdf',
          uploaded_at: '2026-04-15T00:00:00Z',
          has_analysis: false,
          has_practice: false,
        },
      ];
      stubs.api.invoke.mockResolvedValue(uploads);

      const fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.student-banner');
      expect(banner).toBeNull();
    });
  });
});
