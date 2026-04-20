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
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(StudentView);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(mockLayoutNavigation.clearContext).toHaveBeenCalled();
    expect(mockPageTitle.setTitle).toHaveBeenCalledWith('Student Dashboard');
    expect(fixture.nativeElement.textContent).toContain('Student analysis dashboard');
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
      parent: { snapshot: { paramMap: new Map([['id', '1']]) } },
    };

    TestBed.configureTestingModule({
      imports: [StudentView],
      providers: [
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
        { provide: ActivityService, useValue: mockActivityService },
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
});
