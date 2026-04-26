/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamHistory } from './exam-history.component';
import { PageTitleService } from '../../../../page-title.service';
import { LayoutNavigationService } from '../../../../layout/layout-navigation.service';
import { Api } from '../../../../api/generated/api';
import { ExamPdfHistoryItem } from '../../../../api/generated/models';
import { vi } from 'vitest';

type ApiStub = {
  invoke: ReturnType<typeof vi.fn>;
};

type RouterStub = { navigate: ReturnType<typeof vi.fn> };

type ExamHistoryTestInstance = {
  loading: () => boolean;
  navigateToGradingAnalyzer: () => void;
};

const makeRoute = (id: string) => ({
  parent: {
    parent: { snapshot: { paramMap: new Map([['id', id]]) } },
  },
});

const waitForHistoryLoad = async (fixture: ComponentFixture<ExamHistory>): Promise<void> => {
  const instance = fixture.componentInstance as unknown as ExamHistoryTestInstance;

  for (let i = 0; i < 50; i += 1) {
    if (!instance.loading()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
};

const configureModule = async (routeId: string) => {
  const pageTitle = { setTitle: vi.fn() };
  const layoutNav = { clearContext: vi.fn() };
  const router: RouterStub = { navigate: vi.fn() };
  const api: ApiStub = { invoke: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [ExamHistory],
    providers: [
      { provide: PageTitleService, useValue: pageTitle },
      { provide: LayoutNavigationService, useValue: layoutNav },
      { provide: ActivatedRoute, useValue: makeRoute(routeId) },
      { provide: Router, useValue: router },
      { provide: Api, useValue: api },
    ],
  }).compileComponents();

  return { pageTitle, layoutNav, router, api };
};

describe('ExamHistory', () => {
  describe('with a valid course id', () => {
    let fixture: ComponentFixture<ExamHistory>;
    let mockApi: ApiStub;
    let mockRouter: RouterStub;
    let titleService: PageTitleService;
    let navService: LayoutNavigationService;

    beforeEach(async () => {
      const stubs = await configureModule('1');
      mockApi = stubs.api;
      mockRouter = stubs.router;
      titleService = TestBed.inject(PageTitleService);
      navService = TestBed.inject(LayoutNavigationService);
    });

    it('should set the page title and render upload list', async () => {
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

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(titleService.setTitle).toHaveBeenCalledWith('My Exam History');
      expect(navService.clearContext).toHaveBeenCalled();

      const tableRows = fixture.nativeElement.querySelectorAll('.mat-mdc-row');
      expect(tableRows.length).toBe(2);
    });

    it('should render empty state when no uploads', async () => {
      mockApi.invoke.mockResolvedValue([]);

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("You haven't uploaded any exams yet");
    });

    it('should render analysis and practice buttons correctly', async () => {
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

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('View Analysis');
      expect(text).toContain('View Practice');
    });

    it('should show progress bar while loading', () => {
      mockApi.invoke.mockReturnValue(new Promise(() => undefined));

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();

      const progressBar = fixture.nativeElement.querySelector('mat-progress-bar');
      expect(progressBar).not.toBeNull();
    });

    it('should show error message when api call fails', async () => {
      mockApi.invoke.mockRejectedValue(new Error('network error'));

      fixture = TestBed.createComponent(ExamHistory);
      fixture.detectChanges();
      await waitForHistoryLoad(fixture);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'Failed to load your exam history. Please try again.',
      );
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
});
