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
  student_pid: 999,
  generated_at: '2026-01-01T00:00:00Z',
  weak_topics: ['Geometry', 'Trigonometry'],
  flashcards: [
    { front: 'What is a right angle?', back: '90 degrees', topic: 'Geometry' },
    { front: 'What is sin(90)?', back: '1', topic: 'Trigonometry' },
  ],
  questions: [
    {
      question_text: 'What is a right angle?',
      answer: '90 degrees',
      topic: 'Geometry',
      difficulty: 'easy',
    },
    {
      question_text: 'What is sin(90)?',
      answer: '1',
      topic: 'Trigonometry',
      difficulty: 'medium',
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
    const titleMock = { setTitle: vi.fn() };
    await setup({ extraProviders: [{ provide: PageTitleService, useValue: titleMock }] });
    expect(titleMock.setTitle).toHaveBeenCalledWith('Practice Materials');
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
    const heading = fixture.nativeElement.querySelector('[data-testid="weak-topics-heading"]');
    expect(heading?.textContent).toContain('Geometry');
    expect(heading?.textContent).toContain('Trigonometry');
  });

  it('should not show weak topics heading when list is empty', async () => {
    const { fixture } = await setup({ materials: { ...STUB_MATERIALS, weak_topics: [] } });
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
      expect(fixture.nativeElement.querySelector('[data-testid="prev-card-btn"]').disabled).toBe(
        true,
      );
    });

    it('should disable next button on last card', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['flashcardIndex'].set(1);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="next-card-btn"]').disabled).toBe(
        true,
      );
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
      ).toBe('What is a right angle?');
    });

    it('should show question counter', async () => {
      const { fixture } = await setup();
      expect(
        fixture.nativeElement.querySelector('[data-testid="question-counter"]')?.textContent,
      ).toContain('Question 1 of 2');
    });

    it('should render answer input', async () => {
      const { fixture } = await setup();
      expect(fixture.nativeElement.querySelector('[data-testid="answer-input"]')).not.toBeNull();
    });

    it('should disable check answer button when no answer typed', async () => {
      const { fixture } = await setup();
      expect(fixture.nativeElement.querySelector('[data-testid="check-answer-btn"]').disabled).toBe(
        true,
      );
    });

    it('should enable check answer button after typing', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onSelectAnswer']('90 degrees');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="check-answer-btn"]').disabled).toBe(
        false,
      );
    });

    it('should show correct feedback and reveal answer on check', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onSelectAnswer']('90 degrees');
      component['onCheckAnswer']();
      fixture.detectChanges();

      expect(component['isCorrect']()).toBe(true);
      expect(component['score']()).toBe(1);
      expect(fixture.nativeElement.querySelector('[data-testid="answer-reveal"]')).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="correct-answer"]')?.textContent,
      ).toContain('90 degrees');
    });

    it('should show incorrect feedback on wrong answer', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onSelectAnswer']('45 degrees');
      component['onCheckAnswer']();
      fixture.detectChanges();

      expect(component['isCorrect']()).toBe(false);
      expect(component['wrongTopics']()).toContain('Geometry');
    });

    it('should not check answer when nothing selected', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onCheckAnswer']();

      expect(component['submitted']()).toBe(false);
    });

    it('should not check answer again when already submitted', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onSelectAnswer']('90 degrees');
      component['onCheckAnswer']();
      component['onSelectAnswer']('wrong');
      component['onCheckAnswer']();

      expect(component['score']()).toBe(1);
    });

    it('should navigate to next question and clear state', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['onSelectAnswer']('90 degrees');
      component['onNextQuestion']();
      fixture.detectChanges();

      expect(component['questionIndex']()).toBe(1);
      expect(component['selectedAnswer']()).toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="question-counter"]')?.textContent,
      ).toContain('Question 2 of 2');
    });

    it('should not go past last question', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['questionIndex'].set(1);
      component['onNextQuestion']();

      expect(component['questionIndex']()).toBe(1);
    });

    it('should navigate to previous question and clear state', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['questionIndex'].set(1);
      component['onSelectAnswer']('some answer');
      component['onPrevQuestion']();
      fixture.detectChanges();

      expect(component['questionIndex']()).toBe(0);
      expect(component['selectedAnswer']()).toBeNull();
    });

    it('should not go before first question', async () => {
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
      expect(
        fixture.nativeElement.querySelector('[data-testid="prev-question-btn"]').disabled,
      ).toBe(true);
    });

    it('should disable next question button on last question', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['questionIndex'].set(1);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="next-question-btn"]').disabled,
      ).toBe(true);
    });

    it('should show summary after answering last question', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['questionIndex'].set(1);
      component['onSelectAnswer']('1');
      component['onCheckAnswer']();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="summary"]')).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="summary-score"]')?.textContent,
      ).toContain('1 of 2');
    });

    it('should retake quiz and reset all state', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      component['questionIndex'].set(1);
      component['onSelectAnswer']('wrong');
      component['onCheckAnswer']();
      component['onRetake']();
      fixture.detectChanges();

      expect(component['questionIndex']()).toBe(0);
      expect(component['score']()).toBe(0);
      expect(component['wrongTopics']()).toEqual([]);
      expect(component['submitted']()).toBe(false);
      expect(component['selectedAnswer']()).toBeNull();
    });

    it('should show empty state when no questions', async () => {
      const { fixture } = await setup({ materials: { ...STUB_MATERIALS, questions: [] } });
      expect(fixture.nativeElement.textContent).toContain('No quiz questions available.');
    });

    it('should return 0 progress when questions array is empty', async () => {
      const { fixture } = await setup({ materials: { ...STUB_MATERIALS, questions: [] } });
      expect(fixture.componentInstance['progressPct']()).toBe(0);
    });
  });
});
