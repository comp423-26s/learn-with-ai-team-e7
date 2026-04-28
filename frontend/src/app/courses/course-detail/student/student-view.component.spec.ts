/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { StudentView } from './student-view.component';
import { PageTitleService } from '../../../page-title.service';
import { LayoutNavigationService } from '../../../layout/layout-navigation.service';
import { ActivityService } from '../activities/activity.service';
import { GradingAnalyzerService } from '../tools/grading-analyzer.service';
import { StudentDashboardStateService } from './student-dashboard-state.service';

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('StudentView', () => {
  it('should set the page title and render student analysis sections', async () => {
    const mockPageTitle = {
      setTitle: vi.fn(),
    };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() =>
        Promise.resolve([
          {
            id: 10,
            title: 'Dependency Injection',
            type: 'iyow',
            course_id: 1,
            release_date: '2026-01-01T00:00:00Z',
            due_date: '2026-01-02T00:00:00Z',
            late_date: null,
            created_at: '2026-01-01T00:00:00Z',
            active_submission_count: null,
          },
          {
            id: 11,
            title: 'Routing',
            type: 'iyow',
            course_id: 1,
            release_date: '2026-01-01T00:00:00Z',
            due_date: '2026-01-02T00:00:00Z',
            late_date: null,
            created_at: '2026-01-01T00:00:00Z',
            active_submission_count: null,
          },
        ]),
      ),
      getActiveSubmission: vi.fn((_: number, activityId: number) =>
        Promise.resolve(
          activityId === 10
            ? {
                id: 1,
                activity_id: 10,
                student_pid: 111111111,
                is_active: true,
                submitted_at: '2026-01-03T00:00:00Z',
                response_text: 'A response',
                feedback: 'Nice work',
                job: null,
              }
            : null,
        ),
      ),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };

    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(mockLayoutNavigation.clearContext).toHaveBeenCalled();
    expect(mockPageTitle.setTitle).toHaveBeenCalledWith('Student Dashboard');
    const dashboardSection = fixture.nativeElement.querySelector(
      'section[aria-label="Student analysis dashboard"]',
    );
    expect(dashboardSection).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Student snapshot');
    expect(fixture.nativeElement.textContent).toContain("You're making steady progress.");
    expect(fixture.nativeElement.textContent).toContain('Dependency Injection');
    expect(fixture.nativeElement.textContent).toContain('Routing');
    expect(fixture.nativeElement.textContent).toContain('Strength');
    expect(fixture.nativeElement.textContent).toContain('Weakness');
  });

  it('should show an error when dashboard analysis fails to load', async () => {
    const mockPageTitle = {
      setTitle: vi.fn(),
    };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.reject(new Error('fail'))),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };

    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Failed to load student dashboard analysis.',
    );
  });

  it('should show a course-id error when route params do not include an id', async () => {
    const mockPageTitle = {
      setTitle: vi.fn(),
    };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: null,
    };

    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Failed to determine the current course.');
  });

  it('should show "Submission complete" when a submission has no feedback', async () => {
    const mockPageTitle = {
      setTitle: vi.fn(),
    };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() =>
        Promise.resolve([
          {
            id: 10,
            title: 'Dependency Injection',
            type: 'iyow',
            course_id: 1,
            release_date: '2026-01-01T00:00:00Z',
            due_date: '2026-01-02T00:00:00Z',
            late_date: null,
            created_at: '2026-01-01T00:00:00Z',
            active_submission_count: null,
          },
        ]),
      ),
      getActiveSubmission: vi.fn(() =>
        Promise.resolve({
          id: 1,
          activity_id: 10,
          student_pid: 111111111,
          is_active: true,
          submitted_at: '2026-01-03T00:00:00Z',
          response_text: 'A response',
          feedback: '   ',
          job: null,
        }),
      ),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };

    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Submission complete');
  });

  it('should show the latest exam analysis section when an analysis is available', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() =>
        Promise.resolve({
          headline: 'You excelled in Algebra!',
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
        }),
      ),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    // exam analysis loads after the loading spinner turns off — flush again
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Latest Exam Analysis');
    expect(fixture.nativeElement.textContent).toContain('You excelled in Algebra!');
    expect(fixture.nativeElement.textContent).toContain('Algebra');
    expect(fixture.nativeElement.textContent).toContain('Geometry');
  });

  it('should not show the exam analysis section when no analysis is available', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Latest exam analysis"]')).toBeNull();
  });

  it('should show empty-topic message when exam analysis has no topics', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() =>
        Promise.resolve({
          headline: '',
          overall_score_pct: 0,
          strengths: [],
          needs_review: [],
          weaknesses: [],
        }),
      ),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Latest Exam Analysis');
    expect(fixture.nativeElement.textContent).toContain(
      'No topic data available in this analysis.',
    );
  });

  it('should return empty array from examAnalysisTopics when examAnalysis is null', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    // examAnalysis is null, so examAnalysisTopics should return []
    expect(component['examAnalysisTopics']()).toEqual([]);
  });

  it('should show analysisLoading indicator when analysisLoading signal is true', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    fixture.componentInstance['analysisLoading'].set(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[aria-label="Exam analysis loading"]'),
    ).toBeTruthy();
  });

  it('should poll for analysis when uploadId query param is present', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map([['uploadId', '42']]) },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const analysisData = {
      headline: 'Great work!',
      overall_score_pct: 0.9,
      strengths: [{ label: 'Math', topic: 'Math', performance: 'strong', average_score_pct: 0.9 }],
      needs_review: [],
      weaknesses: [],
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(analysisData)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(mockGradingAnalyzerService.getExamAnalysis).toHaveBeenCalledWith(1, 42);
    expect(mockGradingAnalyzerService.getLatestAnalysis).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Latest Exam Analysis');
    expect(fixture.nativeElement.textContent).toContain('Great work!');
  });

  it('should return analysis from pollForAnalysis on first successful attempt', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const analysisData = {
      headline: 'Well done!',
      overall_score_pct: 0.8,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(analysisData)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    const component = fixture.componentInstance;

    const result = await component['pollForAnalysis'](1, 99, 0, 1);
    expect(result).toEqual(analysisData);
  });

  it('should return null from pollForAnalysis after max attempts exhausted', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    const component = fixture.componentInstance;

    const result = await component['pollForAnalysis'](1, 99, 0, 1);
    expect(result).toBeNull();
  });

  it('should map needs_review topics as weaknesses and use overall_score_pct as completion rate', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() =>
        Promise.resolve({
          headline: 'Mixed results',
          overall_score_pct: 0.72,
          strengths: [
            {
              label: 'Math (strong)',
              topic: 'Math',
              performance: 'strong',
              average_score_pct: 0.9,
            },
          ],
          needs_review: [
            {
              label: 'Science (review)',
              topic: 'Science',
              performance: 'needs_review',
              average_score_pct: 0.65,
            },
          ],
          weaknesses: [],
        }),
      ),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    // overall_score_pct should drive completionRate
    expect(component['completionRate']()).toBe(0.72);
    // Math (strength) should appear in the Strengths section
    expect(
      fixture.nativeElement.querySelector('[aria-label="Strength topics"]').textContent,
    ).toContain('Math');
    // Science (needs_review) should appear in the Weaknesses section
    expect(
      fixture.nativeElement.querySelector('[aria-label="Weakness topics"]').textContent,
    ).toContain('Science');
  });

  it('should use cached analysis and skip getLatestAnalysis when cache is pre-populated', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const cachedAnalysis = {
      headline: 'Cached result!',
      overall_score_pct: 0.75,
      strengths: [
        {
          label: 'Calculus (strong)',
          topic: 'Calculus',
          performance: 'strong' as const,
          average_score_pct: 0.85,
        },
      ],
      needs_review: [] as never[],
      weaknesses: [] as never[],
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(null)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    // Pre-populate the cache before creating the component
    const stateService = TestBed.inject(StudentDashboardStateService);
    stateService.setAnalysis(1, cachedAnalysis);

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    // Cache hit — network fetch must not be made
    expect(mockGradingAnalyzerService.getLatestAnalysis).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Cached result!');
  });

  it('should store analysis in state service after loading from network', async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockActivityService = {
      list: vi.fn(() => Promise.resolve([])),
      getActiveSubmission: vi.fn(() => Promise.resolve(null)),
    };
    const mockRoute = {
      snapshot: { queryParamMap: new Map() },
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };
    const networkAnalysis = {
      headline: 'Network result',
      overall_score_pct: 0.6,
      strengths: [],
      needs_review: [],
      weaknesses: [],
    };
    const mockGradingAnalyzerService = {
      getLatestAnalysis: vi.fn(() => Promise.resolve(networkAnalysis)),
      getExamAnalysis: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: GradingAnalyzerService, useValue: mockGradingAnalyzerService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const stateService = TestBed.inject(StudentDashboardStateService);
    expect(stateService.getAnalysis(1)).toEqual(networkAnalysis);
  });
});
