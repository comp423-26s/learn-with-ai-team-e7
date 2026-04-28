import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { PageTitleService } from '../../../../page-title.service';
import { PracticeService } from '../practice.service';
import type { PracticeMaterialResponse } from '../../../../api/generated/models/practice-material-response';
import type { Flashcard } from '../../../../api/generated/models/flashcard';
import type { PracticeQuestion } from '../../../../api/generated/models/practice-question';

@Component({
  selector: 'app-practice-materials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatIconModule,
    RouterLink,
  ],
  templateUrl: './practice-materials.component.html',
  styleUrl: './practice-materials.component.scss',
})
export class PracticeMaterialsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly practiceService = inject(PracticeService);
  private readonly titleService = inject(PageTitleService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly weakTopics = signal<string[]>([]);
  protected readonly flashcards = signal<Flashcard[]>([]);
  protected readonly questions = signal<PracticeQuestion[]>([]);

  // ── flashcard state ───────────────────────────────────────────────────────
  protected readonly flashcardIndex = signal(0);
  protected readonly flipped = signal(false);
  protected readonly currentFlashcard = computed(
    (): Flashcard => this.flashcards()[this.flashcardIndex()],
  );

  // ── quiz state ────────────────────────────────────────────────────────────
  protected readonly questionIndex = signal(0);
  protected readonly currentQuestion = computed(
    (): PracticeQuestion => this.questions()[this.questionIndex()],
  );
  protected readonly selectedAnswer = signal<string | null>(null);
  protected readonly progressPct = computed(() => {
    const total = this.questions().length;
    if (total === 0) return 0;
    return ((this.questionIndex() + 1) / total) * 100;
  });

  protected readonly courseId: number;

  constructor() {
    this.titleService.setTitle('Practice Materials');
    this.courseId = this.resolveCourseId();
  }

  async ngOnInit(): Promise<void> {
    const uploadIdParam = this.route.snapshot.queryParamMap.get('uploadId');
    const uploadId = uploadIdParam ? Number(uploadIdParam) : Number.NaN;

    if (!Number.isFinite(uploadId) || uploadId <= 0) {
      this.errorMessage.set('Missing or invalid upload ID.');
      this.loading.set(false);
      return;
    }

    try {
      const result: PracticeMaterialResponse = await this.practiceService.getPractice(
        this.courseId,
        uploadId,
      );
      this.weakTopics.set(result.weak_topics);
      this.flashcards.set(result.flashcards);
      this.questions.set(result.questions);
    } catch {
      this.errorMessage.set('Could not load practice materials. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly submitted = signal(false);
  protected readonly isCorrect = signal<boolean | null>(null);

  protected readonly score = signal(0);
  protected readonly wrongTopics = signal<string[]>([]);

  protected readonly showSummary = computed(
    () => this.questionIndex() === this.questions().length - 1 && this.submitted(),
  );

  // ── flashcard controls ────────────────────────────────────────────────────

  protected onFlip(): void {
    this.flipped.set(!this.flipped());
  }

  protected onPrevCard(): void {
    if (this.flashcardIndex() > 0) {
      this.flashcardIndex.update((i) => i - 1);
      this.flipped.set(false);
    }
  }

  protected onNextCard(): void {
    if (this.flashcardIndex() < this.flashcards().length - 1) {
      this.flashcardIndex.update((i) => i + 1);
      this.flipped.set(false);
    }
  }

  // ── quiz controls ─────────────────────────────────────────────────────────

  protected onSelectAnswer(answer: string): void {
    this.selectedAnswer.set(answer);
  }

  protected onNextQuestion(): void {
    if (this.questionIndex() < this.questions().length - 1) {
      this.questionIndex.update((i) => i + 1);
      this.selectedAnswer.set(null);
    }
  }

  protected onPrevQuestion(): void {
    if (this.questionIndex() > 0) {
      this.questionIndex.update((i) => i - 1);
      this.selectedAnswer.set(null);
    }
  }

  private resolveCourseId(): number {
    let currentRoute: ActivatedRoute | null = this.route;
    while (currentRoute) {
      const id = currentRoute.snapshot.paramMap.get('id');
      if (id) return Number(id);
      currentRoute = currentRoute.parent;
    }
    return Number.NaN;
  }

  protected onCheckAnswer(): void {
    if (!this.selectedAnswer() || this.submitted()) return;

    const question = this.currentQuestion();

    const correct = question.answer.trim().toLowerCase();
    const selected = this.selectedAnswer()!.trim().toLowerCase();

    const isCorrect = correct === selected;

    this.isCorrect.set(isCorrect);
    this.submitted.set(true);

    if (isCorrect) {
      this.score.update((s) => s + 1);
    } else {
      this.wrongTopics.update((t) => [...t, question.topic]);
    }
  }
  protected onRetake(): void {
    this.questionIndex.set(0);
    this.selectedAnswer.set(null);
    this.submitted.set(false);
    this.isCorrect.set(null);

    this.score.set(0);
    this.wrongTopics.set([]);

    this.questions.update((q) => [...q.sort(() => Math.random() - 0.5)]);
  }
}
