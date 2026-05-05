/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { GeneratePractice } from './generate-practice.component';
import { PageTitleService } from '../../../../page-title.service';
import { LayoutNavigationService } from '../../../../layout/layout-navigation.service';
import { PracticeService } from '../../tools/practice.service';
import { Api } from '../../../../api/generated/api';
import type { ExamPdfHistoryItem } from '../../../../api/generated/models';
import type { PracticeMaterialGenerateResponse } from '../../../../api/generated/models/practice-material-generate-response';
import type { PracticeMaterialResponse } from '../../../../api/generated/models/practice-material-response';
import { vi } from 'vitest';

type ApiStub = { invoke: ReturnType<typeof vi.fn> };
type PracticeServiceStub = {
  generatePractice: ReturnType<typeof vi.fn>;
  getPractice: ReturnType<typeof vi.fn>;
};
type RouterStub = { navigate: ReturnType<typeof vi.fn> };

const EXAM_LIST: ExamPdfHistoryItem[] = [
  {
    id: 1,
    original_filename: 'midterm.pdf',
    uploaded_at: '2026-04-10T00:00:00Z',
    has_analysis: true,
    has_practice: false,
  },
  {
    id: 2,
    original_filename: 'final.pdf',
    uploaded_at: '2026-04-20T00:00:00Z',
    has_analysis: false,
    has_practice: false,
  },
];

const PRACTICE_MATERIAL: PracticeMaterialResponse = {
  id: 5,
  course_id: 42,
  upload_id: 1,
  student_pid: 999,
  generated_at: '2026-04-25T00:00:00Z',
  weak_topics: ['Algebra'],
  flashcards: [{ front: 'What is 2+2?', back: '4', topic: 'Algebra' }],
  questions: [{ question_text: 'What is 2+2?', answer: '4', topic: 'Algebra', difficulty: 'easy' }],
};

const GENERATE_QUEUED: PracticeMaterialGenerateResponse = {
  job_id: 99,
  status: 'pending',
};

const makeRoute = (courseId: string) => ({
  parent: {
    snapshot: { paramMap: new Map([['id', courseId]]) },
  },
  snapshot: { paramMap: new Map() },
});

type GeneratePracticeInstance = {
  loadingExams: () => boolean;
  generating: () => boolean;
  selectedUploadId: () => number | null;
  onGenerate: () => Promise<void>;
  pollUntilReady: (uploadId: number, intervalMs?: number, maxAttempts?: number) => Promise<void>;
};

const waitForLoad = async (fixture: ComponentFixture<GeneratePractice>): Promise<void> => {
  const instance = fixture.componentInstance as unknown as GeneratePracticeInstance;
  for (let i = 0; i < 100; i++) {
    if (!instance.loadingExams()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
};

describe('GeneratePractice', () => {
  describe('with valid course id', () => {
    let stubs: {
      pageTitle: { setTitle: ReturnType<typeof vi.fn> };
      layoutNav: { clearContext: ReturnType<typeof vi.fn> };
      router: RouterStub;
      api: ApiStub;
      practiceService: PracticeServiceStub;
    };

    beforeEach(async () => {
      stubs = {
        pageTitle: { setTitle: vi.fn() },
        layoutNav: { clearContext: vi.fn() },
        router: { navigate: vi.fn().mockResolvedValue(true) },
        api: { invoke: vi.fn() },
        practiceService: { generatePractice: vi.fn(), getPractice: vi.fn() },
      };

      await TestBed.configureTestingModule({
        imports: [GeneratePractice, NoopAnimationsModule],
        providers: [
          { provide: PageTitleService, useValue: stubs.pageTitle },
          { provide: LayoutNavigationService, useValue: stubs.layoutNav },
          { provide: ActivatedRoute, useValue: makeRoute('42') },
          { provide: Router, useValue: stubs.router },
          { provide: Api, useValue: stubs.api },
          { provide: PracticeService, useValue: stubs.practiceService },
        ],
      }).compileComponents();
    });

    describe('initial load', () => {
      it('should set the page title and clear nav context', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        expect(stubs.pageTitle.setTitle).toHaveBeenCalledWith('Generate Practice Materials');
        expect(stubs.layoutNav.clearContext).toHaveBeenCalled();
      });

      it('should show exam list after loading', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const text = fixture.nativeElement.textContent;
        expect(text).toContain('midterm.pdf');
        expect(text).toContain('final.pdf');
      });

      it('should show progress bar while loading', () => {
        stubs.api.invoke.mockReturnValue(new Promise(() => undefined));
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('mat-progress-bar')).not.toBeNull();
      });

      it('should show empty state when no exams exist', async () => {
        stubs.api.invoke.mockResolvedValue([]);
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('No exams uploaded yet');
      });

      it('should show error when exam load fails', async () => {
        stubs.api.invoke.mockRejectedValue(new Error('network error'));
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain(
          'Failed to load your exam uploads. Please try again.',
        );
      });
    });

    describe('exam selection', () => {
      it('should select an exam when clicked', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const instance = fixture.componentInstance as unknown as GeneratePracticeInstance;
        expect(instance.selectedUploadId()).toBeNull();

        const buttons = fixture.nativeElement.querySelectorAll('button.exam-item');
        buttons[0].click();
        fixture.detectChanges();

        expect(instance.selectedUploadId()).toBe(1);
      });

      it('should mark selected exam with aria-pressed=true', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const buttons = fixture.nativeElement.querySelectorAll('button.exam-item');
        buttons[0].click();
        fixture.detectChanges();

        expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
        expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
      });

      it('generate button should be disabled when no exam is selected', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const btn = fixture.nativeElement.querySelector('[data-testid="generate-btn"]');
        expect(btn).not.toBeNull();
        expect(btn.disabled).toBe(true);
      });

      it('generate button should be enabled after exam selection', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const buttons = fixture.nativeElement.querySelectorAll('button.exam-item');
        buttons[0].click();
        fixture.detectChanges();

        const btn = fixture.nativeElement.querySelector('[data-testid="generate-btn"]');
        expect(btn.disabled).toBe(false);
      });
    });

    describe('generation flow — materials already exist', () => {
      it('navigates directly to practice viewer when server returns existing materials', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        stubs.practiceService.generatePractice.mockResolvedValue(PRACTICE_MATERIAL);

        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const buttons = fixture.nativeElement.querySelectorAll('button.exam-item');
        buttons[0].click();
        fixture.detectChanges();

        const generateBtn = fixture.nativeElement.querySelector('[data-testid="generate-btn"]');
        generateBtn.click();
        fixture.detectChanges();

        await new Promise<void>((resolve) => setTimeout(resolve, 50));

        expect(stubs.router.navigate).toHaveBeenCalledWith(
          ['/courses', 42, 'student', 'tools', 'grading-analyzer', 'practice'],
          { queryParams: { uploadId: 1 } },
        );
      });

      it('shows an error when practice viewer navigation fails', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        stubs.practiceService.generatePractice.mockResolvedValue(PRACTICE_MATERIAL);
        stubs.router.navigate.mockResolvedValueOnce(false);

        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const buttons = fixture.nativeElement.querySelectorAll('button.exam-item');
        buttons[0].click();
        fixture.detectChanges();

        const generateBtn = fixture.nativeElement.querySelector('[data-testid="generate-btn"]');
        generateBtn.click();
        fixture.detectChanges();

        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain(
          'Failed to open the practice viewer. Please try again.',
        );
      });
    });

    describe('generation flow — job queued', () => {
      it('navigates after polling finds completed materials', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        stubs.practiceService.generatePractice.mockResolvedValue(GENERATE_QUEUED);
        stubs.practiceService.getPractice.mockResolvedValue(PRACTICE_MATERIAL);

        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const buttons = fixture.nativeElement.querySelectorAll('button.exam-item');
        buttons[0].click();
        fixture.detectChanges();

        const generateBtn = fixture.nativeElement.querySelector('[data-testid="generate-btn"]');
        generateBtn.click();
        fixture.detectChanges();

        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        fixture.detectChanges();

        expect(stubs.router.navigate).toHaveBeenCalledWith(
          ['/courses', 42, 'student', 'tools', 'grading-analyzer', 'practice'],
          { queryParams: { uploadId: 1 } },
        );
      });

      it('shows error when polling exhausts max attempts', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        stubs.practiceService.getPractice.mockRejectedValue(new Error('not ready'));

        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const instance = fixture.componentInstance as unknown as GeneratePracticeInstance;
        await instance.pollUntilReady(1, 0, 1);
        fixture.detectChanges();

        expect(
          fixture.nativeElement.querySelector('[data-testid="generate-error"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain('taking longer than expected');
      });

      it('shows error when generatePractice call fails', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        stubs.practiceService.generatePractice.mockRejectedValue(new Error('server error'));

        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const instance = fixture.componentInstance as unknown as GeneratePracticeInstance;
        const buttons = fixture.nativeElement.querySelectorAll('button.exam-item');
        buttons[0].click();
        fixture.detectChanges();

        await instance.onGenerate();
        fixture.detectChanges();

        expect(
          fixture.nativeElement.querySelector('[data-testid="generate-error"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain(
          'Failed to generate practice materials',
        );
      });

      it('sleeps between poll attempts when practice is not yet ready', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        stubs.practiceService.getPractice.mockRejectedValue(new Error('not ready'));

        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const instance = fixture.componentInstance as unknown as GeneratePracticeInstance;
        // maxAttempts=2, intervalMs=0: attempt 0 fails → sleep (line 106) → attempt 1 fails → error
        await instance.pollUntilReady(1, 0, 2);
        fixture.detectChanges();

        expect(
          fixture.nativeElement.querySelector('[data-testid="generate-error"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain('taking longer than expected');
      });

      it('does nothing when onGenerate called with no selection', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);

        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const instance = fixture.componentInstance as unknown as GeneratePracticeInstance;
        await instance.onGenerate();

        expect(stubs.practiceService.generatePractice).not.toHaveBeenCalled();
      });
    });

    describe('onSelectExam error clearing', () => {
      it('clears generateError when a new exam is selected', async () => {
        stubs.api.invoke.mockResolvedValue(EXAM_LIST);
        stubs.practiceService.generatePractice.mockRejectedValue(new Error('fail'));

        const fixture = TestBed.createComponent(GeneratePractice);
        fixture.detectChanges();
        await waitForLoad(fixture);
        fixture.detectChanges();

        const instance = fixture.componentInstance as unknown as GeneratePracticeInstance;
        const buttons = fixture.nativeElement.querySelectorAll('button.exam-item');
        buttons[0].click();
        fixture.detectChanges();

        await instance.onGenerate();
        fixture.detectChanges();
        expect(
          fixture.nativeElement.querySelector('[data-testid="generate-error"]'),
        ).not.toBeNull();

        buttons[1].click();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[data-testid="generate-error"]')).toBeNull();
      });
    });
  }); // end describe('with valid course id')

  describe('with invalid course id', () => {
    let stubs: {
      api: ApiStub;
    };

    beforeEach(async () => {
      stubs = { api: { invoke: vi.fn() } };

      await TestBed.configureTestingModule({
        imports: [GeneratePractice, NoopAnimationsModule],
        providers: [
          { provide: PageTitleService, useValue: { setTitle: vi.fn() } },
          { provide: LayoutNavigationService, useValue: { clearContext: vi.fn() } },
          { provide: ActivatedRoute, useValue: makeRoute('not-a-number') },
          { provide: Router, useValue: { navigate: vi.fn() } },
          { provide: Api, useValue: stubs.api },
          {
            provide: PracticeService,
            useValue: { generatePractice: vi.fn(), getPractice: vi.fn() },
          },
        ],
      }).compileComponents();
    });

    it('should show error when course id is NaN', async () => {
      stubs.api.invoke.mockResolvedValue([]);
      const fixture = TestBed.createComponent(GeneratePractice);
      fixture.detectChanges();
      await waitForLoad(fixture);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'Failed to determine the current course.',
      );
    });
  });
});
