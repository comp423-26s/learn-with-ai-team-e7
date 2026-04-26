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

type ExamHistoryTestInstance = {
  loading: () => boolean;
};

const waitForHistoryLoad = async (fixture: ComponentFixture<ExamHistory>): Promise<void> => {
  const instance = fixture.componentInstance as unknown as ExamHistoryTestInstance;

  for (let i = 0; i < 50; i += 1) {
    if (!instance.loading()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for exam history to load.');
};

describe('ExamHistory', () => {
  let fixture: ComponentFixture<ExamHistory>;
  let mockApi: ApiStub;
  let titleService: PageTitleService;
  let navService: LayoutNavigationService;

  beforeEach(async () => {
    const mockPageTitle = { setTitle: vi.fn() };
    const mockLayoutNavigation = { clearContext: vi.fn() };
    const mockRouter = { navigate: vi.fn() };
    const mockRoute = {
      parent: {
        parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
      },
    };

    mockApi = {
      invoke: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ExamHistory],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: Api, useValue: mockApi },
      ],
    }).compileComponents();

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

    const emptyState = fixture.nativeElement.textContent;
    expect(emptyState).toContain("You haven't uploaded any exams yet");
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
});
