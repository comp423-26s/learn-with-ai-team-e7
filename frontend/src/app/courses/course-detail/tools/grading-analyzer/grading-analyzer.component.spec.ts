/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { GradingAnalyzer } from './grading-analyzer.component';
import { GradingAnalyzerService } from '../grading-analyzer.service';
import { PageTitleService } from '../../../../page-title.service';

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('GradingAnalyzer', () => {
  async function setup(options: { uploadError?: boolean; includeRouteId?: boolean } = {}) {
    const mockService = {
      uploadExam: options.uploadError
        ? vi.fn(() => Promise.reject(new Error('fail')))
        : vi.fn(() =>
            Promise.resolve({
              uploadId: 42,
              analysis: { strengths: [] } as Record<string, unknown>,
            }),
          ),
    };

    const mockRoute = {
      snapshot: { paramMap: convertToParamMap({}) },
      parent: {
        snapshot: { paramMap: convertToParamMap({}) },
        parent: {
          snapshot: {
            paramMap: convertToParamMap(options.includeRouteId === false ? {} : { id: '3' }),
          },
          parent: null,
        },
      },
    };

    TestBed.configureTestingModule({
      imports: [GradingAnalyzer, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: GradingAnalyzerService, useValue: mockService },
        { provide: PageTitleService, useValue: { setTitle: vi.fn() } },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });

    const fixture = TestBed.createComponent(GradingAnalyzer);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    return { fixture, mockService };
  }

  it('should set the page title', async () => {
    await setup();
    const titleService = TestBed.inject(PageTitleService);
    expect(titleService.setTitle).toHaveBeenCalledWith('Grading Analyzer');
  });

  it('should read the course ID from the route', async () => {
    const { fixture } = await setup();
    expect(fixture.componentInstance['courseId']).toBe(3);
  });

  it('should show the upload form by default', async () => {
    const { fixture } = await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('form')).toBeTruthy();
    expect(el.textContent).toContain('Upload');
  });

  it('should reject a non-PDF file', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
    const event = { target: { files: [file] } } as unknown as Event;
    component['onFileSelected'](event);
    fixture.detectChanges();

    expect(component['selectedFile']()).toBeNull();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Only PDF files are accepted.');
  });

  it('should reject a PDF larger than 50 MB', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const bigContent = new Uint8Array(51 * 1024 * 1024);
    const file = new File([bigContent], 'big.pdf', { type: 'application/pdf' });
    const event = { target: { files: [file] } } as unknown as Event;
    component['onFileSelected'](event);
    fixture.detectChanges();

    expect(component['selectedFile']()).toBeNull();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('File must be 50MB or smaller.');
  });

  it('should accept a valid PDF file', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const file = new File(['pdf'], 'exam.pdf', { type: 'application/pdf' });
    const event = { target: { files: [file] } } as unknown as Event;
    component['onFileSelected'](event);
    fixture.detectChanges();

    expect(component['selectedFile']()).toBe(file);
    expect(component['errorMessage']()).toBe('');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('exam.pdf');
  });

  it('should do nothing when no file is in the event', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const event = { target: { files: [] } } as unknown as Event;
    component['onFileSelected'](event);

    expect(component['selectedFile']()).toBeNull();
  });

  it('should accept a file via the DOM change event on the file input (line 52)', async () => {
    const { fixture } = await setup();
    const fileInput = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['pdf'], 'via-dom.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedFile']()).toBe(file);
  });

  it('should delegate to the hidden file input when Choose PDF is clicked (line 40)', async () => {
    const { fixture } = await setup();
    const chooseBtn = fixture.nativeElement.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    const fileInput = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    chooseBtn.click();

    expect(clickSpy).toHaveBeenCalled();
  });

  it('should not submit when form is invalid', async () => {
    const { fixture, mockService } = await setup();
    const component = fixture.componentInstance;

    await component['onSubmit']();

    expect(mockService.uploadExam).not.toHaveBeenCalled();
  });

  it('should not submit when no file is selected', async () => {
    const { fixture, mockService } = await setup();
    const component = fixture.componentInstance;

    await component['onSubmit']();

    expect(mockService.uploadExam).not.toHaveBeenCalled();
  });

  it('should upload and show success state', async () => {
    const { fixture, mockService } = await setup();
    const component = fixture.componentInstance;

    const file = new File(['pdf'], 'exam.pdf', { type: 'application/pdf' });
    component['selectedFile'].set(file);

    await component['onSubmit']();
    fixture.detectChanges();

    expect(mockService.uploadExam).toHaveBeenCalledWith(3, file);
    expect(component['uploadSuccess']()).toBe(true);
  });

  it('should submit through the form and prevent the default browser navigation', async () => {
    const { fixture, mockService } = await setup();
    const component = fixture.componentInstance;
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    const file = new File(['pdf'], 'exam.pdf', { type: 'application/pdf' });
    component['selectedFile'].set(file);

    const submitEvent = new Event('submit', {
      bubbles: true,
      cancelable: true,
    });

    form.dispatchEvent(submitEvent);
    fixture.detectChanges();

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(mockService.uploadExam).toHaveBeenCalledWith(3, file);
  });

  it('should show error when upload fails', async () => {
    const { fixture } = await setup({ uploadError: true });
    const component = fixture.componentInstance;

    const file = new File(['pdf'], 'exam.pdf', { type: 'application/pdf' });
    component['selectedFile'].set(file);

    await component['onSubmit']();
    fixture.detectChanges();

    expect(component['uploadSuccess']()).toBe(false);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Upload failed. Please try again.');
  });

  it('should reset to upload form after success', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    component['uploadSuccess'].set(true);
    fixture.detectChanges();

    const uploadAnotherBtn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    uploadAnotherBtn.click();
    fixture.detectChanges();

    expect(component['uploadSuccess']()).toBe(false);
    expect(component['errorMessage']()).toBe('');
    expect(component['selectedFile']()).toBeNull();
  });

  it('should show spinner while uploading', async () => {
    let resolveUpload!: (value: { uploadId: number; analysis: Record<string, unknown> }) => void;
    const { fixture, mockService } = await setup();
    const component = fixture.componentInstance;

    mockService.uploadExam.mockReturnValueOnce(
      new Promise<{ uploadId: number; analysis: Record<string, unknown> }>((res) => {
        resolveUpload = res;
      }),
    );

    const file = new File(['pdf'], 'exam.pdf', { type: 'application/pdf' });
    component['selectedFile'].set(file);

    const submitPromise = component['onSubmit']();
    fixture.detectChanges();

    expect(component['uploading']()).toBe(true);

    resolveUpload({ uploadId: 1, analysis: { strengths: [] } });
    await submitPromise;
    fixture.detectChanges();

    expect(component['uploading']()).toBe(false);
  });

  it('should fall back to NaN course id when route chain has no id', async () => {
    const { fixture } = await setup({ includeRouteId: false });

    expect(fixture.componentInstance['courseId']).toBeNaN();
  });
});
