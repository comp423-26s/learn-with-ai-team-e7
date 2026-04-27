import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Provider } from '@angular/core';
import { PracticeMaterialsComponent } from './practice-materials.component';
import { PracticeService } from '../practice.service';
import { PageTitleService } from '../../../../page-title.service';
import type { PracticeMaterialResponse } from '../../../../api/generated/models/practice-material-response';

const STUB_MATERIALS: PracticeMaterialResponse = {
  id: 1,
  course_id: 3,
  upload_id: 22,
  student_pid: 764629222,
  generated_at: '2026-01-01T00:00:00Z',
  weak_topics: ['Geometry', 'Trigonometry'],
  flashcards: [
    { front: 'What is a right angle?', back: '90 degrees', topic: 'Geometry' },
    { front: 'What is sin(90)?', back: '1', topic: 'Trigonometry' },
  ],
  questions: [
    {
      question_text: 'What is 2 + 2?',
      answer: '4',
      topic: 'Math',
    },
    {
      question_text: 'What is the capital of France?',
      answer: 'Paris',
      topic: 'Geography',
    },
  ],
};

describe('PracticeMaterialsComponent', () => {
  async function setup(
    options: {
      uploadId?: string | null;
      materials?: PracticeMaterialResponse | null;
      extraProviders?: Provider[];
    } = {},
  ) {
    const practiceServiceMock = {
      getPractice: vi
        .fn()
        .mockResolvedValue(options.materials !== undefined ? options.materials : STUB_MATERIALS),
    };

    const queryParams = options.uploadId === null ? {} : { uploadId: options.uploadId ?? '22' };

    const mockRoute = {
      snapshot: {
        queryParamMap: convertToParamMap(queryParams),
        paramMap: convertToParamMap({}),
      },
      parent: {
        snapshot: { paramMap: convertToParamMap({ id: '3' }) },
        parent: null,
      },
    };

    TestBed.configureTestingModule({
      imports: [PracticeMaterialsComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: PracticeService, useValue: practiceServiceMock },
        { provide: PageTitleService, useValue: { setTitle: vi.fn() } },
        { provide: ActivatedRoute, useValue: mockRoute },
        ...(options.extraProviders ?? []),
      ],
    });

    const fixture = TestBed.createComponent(PracticeMaterialsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture, practiceServiceMock };
  }

  it('should set the page title', async () => {
    const titleService = { setTitle: vi.fn() };
    await setup({ extraProviders: [{ provide: PageTitleService, useValue: titleService }] });
    expect(titleService.setTitle).toHaveBeenCalledWith('Practice Materials');
  });

  it('should show error for missing upload id', async () => {
    const { fixture } = await setup({ uploadId: null });
    expect(fixture.nativeElement.textContent).toContain('Missing or invalid upload ID.');
  });

  it('should show error when getPractice fails', async () => {
    const { fixture } = await setup({
      extraProviders: [
        {
          provide: PracticeService,
          useValue: { getPractice: vi.fn().mockRejectedValue(new Error('fail')) },
        },
      ],
    });
    expect(fixture.nativeElement.textContent).toContain('Could not load practice materials.');
  });

  it('should display weak topics heading', async () => {
    const { fixture } = await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="weak-topics-heading"]')?.textContent).toContain(
      'Geometry',
    );
    expect(el.querySelector('[data-testid="weak-topics-heading"]')?.textContent).toContain(
      'Trigonometry',
    );
  });

  it('should not show weak topics heading when list is empty', async () => {
    const { fixture } = await setup({
      materials: { ...STUB_MATERIALS, weak_topics: [] },
    });
    expect(fixture.nativeElement.querySelector('[data-testid="weak-topics-heading"]')).toBeNull();
  });

  describe('Flashcards', () => {
    it('should render first flashcard front by default', async () => {
      const { fixture } = await setup();
      expect(
        fixture.nativeElement.querySelector('[data-testid="flashcard-front"]')?.textContent?.trim(),
      ).toBe('What is a right angle?');
    });

    it('should show card counter', async () => {
      const { fixture } = await setup();
      expect(
        fixture.nativeElement.querySelector('[data-testid="flashcard-counter"]')?.textContent,
      ).toContain('Card 1 of 2');
    });

    it('should flip to show back of card', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onFlip']();
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="flashcard-back"]')?.textContent?.trim(),
      ).toBe('90 degrees');
      expect(fixture.nativeElement.querySelector('[data-testid="flashcard-front"]')).toBeNull();
    });

    it('should flip back to front when flipped again', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onFlip']();
      component['onFlip']();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="flashcard-front"]')).not.toBeNull();
    });

    it('should navigate to next card and reset flip', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['flipped'].set(true);
      component['onNextCard']();
      fixture.detectChanges();

      expect(component['flashcardIndex']()).toBe(1);
      expect(component['flipped']()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('[data-testid="flashcard-counter"]')?.textContent,
      ).toContain('Card 2 of 2');
    });

    it('should not go past the last card', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['flashcardIndex'].set(1);
      component['onNextCard']();

      expect(component['flashcardIndex']()).toBe(1);
    });

    it('should navigate to previous card and reset flip', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['flashcardIndex'].set(1);
      component['flipped'].set(true);
      component['onPrevCard']();
      fixture.detectChanges();

      expect(component['flashcardIndex']()).toBe(0);
      expect(component['flipped']()).toBe(false);
    });

    it('should not go before the first card', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onPrevCard']();

      expect(component['flashcardIndex']()).toBe(0);
    });

    it('should disable prev button on first card', async () => {
      const { fixture } = await setup();
      const btn = fixture.nativeElement.querySelector('[data-testid="prev-card-btn"]');
      expect(btn.disabled).toBe(true);
    });

    it('should disable next button on last card', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['flashcardIndex'].set(1);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('[data-testid="next-card-btn"]');
      expect(btn.disabled).toBe(true);
    });

    it('should show empty state when no flashcards', async () => {
      const { fixture } = await setup({ materials: { ...STUB_MATERIALS, flashcards: [] } });
      expect(fixture.nativeElement.textContent).toContain('No flashcards available.');
    });
  });

  describe('Quiz', () => {
    it('should render first question text', async () => {
      const { fixture } = await setup();
      expect(
        fixture.nativeElement.querySelector('[data-testid="question-text"]')?.textContent?.trim(),
      ).toBe('What is 2 + 2?');
    });

    it('should show question counter', async () => {
      const { fixture } = await setup();
      expect(
        fixture.nativeElement.querySelector('[data-testid="question-counter"]')?.textContent,
      ).toContain('Question 1 of 2');
    });

    it('should render all four answer options', async () => {
      const { fixture } = await setup();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-testid="answer-A"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="answer-B"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="answer-C"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="answer-D"]')).not.toBeNull();
    });

    it('should mark selected answer', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onSelectAnswer']('B');
      fixture.detectChanges();

      expect(component['selectedAnswer']()).toBe('B');
      expect(
        fixture.nativeElement
          .querySelector('[data-testid="answer-B"]')
          ?.classList.contains('selected'),
      ).toBe(true);
    });

    it('should navigate to next question and clear selection', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onSelectAnswer']('B');
      component['onNextQuestion']();
      fixture.detectChanges();

      expect(component['questionIndex']()).toBe(1);
      expect(component['selectedAnswer']()).toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="question-counter"]')?.textContent,
      ).toContain('Question 2 of 2');
    });

    it('should not go past the last question', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['questionIndex'].set(1);
      component['onNextQuestion']();

      expect(component['questionIndex']()).toBe(1);
    });

    it('should navigate to previous question and clear selection', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['questionIndex'].set(1);
      component['onSelectAnswer']('A');
      component['onPrevQuestion']();
      fixture.detectChanges();

      expect(component['questionIndex']()).toBe(0);
      expect(component['selectedAnswer']()).toBeNull();
    });

    it('should not go before the first question', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onPrevQuestion']();

      expect(component['questionIndex']()).toBe(0);
    });

    it('should update progress bar value', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      expect(component['progressPct']()).toBe(50);

      component['onNextQuestion']();
      expect(component['progressPct']()).toBe(100);
    });

    it('should disable prev question button on first question', async () => {
      const { fixture } = await setup();
      const btn = fixture.nativeElement.querySelector('[data-testid="prev-question-btn"]');
      expect(btn.disabled).toBe(true);
    });

    it('should disable next question button on last question', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['questionIndex'].set(1);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('[data-testid="next-question-btn"]');
      expect(btn.disabled).toBe(true);
    });

    it('should show empty state when no questions', async () => {
      const { fixture } = await setup({ materials: { ...STUB_MATERIALS, questions: [] } });
      expect(fixture.nativeElement.textContent).toContain('No quiz questions available.');
    });

    it('should return 0 progress when questions array is empty', async () => {
      const { fixture } = await setup({ materials: { ...STUB_MATERIALS, questions: [] } });
      const component = fixture.componentInstance;
      expect(component['progressPct']()).toBe(0);
    });
  });
});
