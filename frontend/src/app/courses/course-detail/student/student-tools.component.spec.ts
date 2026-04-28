/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StudentTools } from './student-tools.component';
import { PageTitleService } from '../../../page-title.service';
import { LayoutNavigationService } from '../../../layout/layout-navigation.service';

describe('StudentTools', () => {
  it('should set the page title and render Grading Analyzer and Exam History cards', () => {
    const mockPageTitle = {
      title: vi.fn(),
      setTitle: vi.fn(),
    };
    const mockLayoutNavigation = { clearContext: vi.fn() };

    TestBed.configureTestingModule({
      imports: [StudentTools],
      providers: [
        provideRouter([]),
        { provide: PageTitleService, useValue: mockPageTitle },
        { provide: LayoutNavigationService, useValue: mockLayoutNavigation },
      ],
    });

    const fixture = TestBed.createComponent(StudentTools);
    fixture.detectChanges();

    expect(mockLayoutNavigation.clearContext).toHaveBeenCalled();
    expect(mockPageTitle.setTitle).toHaveBeenCalledWith('Student Tools');
    expect(fixture.nativeElement.textContent).toContain('Grading Analyzer');
    expect(fixture.nativeElement.textContent).toContain('My Exam History');
    expect(fixture.nativeElement.textContent).toContain('Generate Practice Materials');
  });
});
