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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { PageTitleService } from '../../../../page-title.service';
import { PracticeService } from '../practice.service';
import type { PracticeMaterialResponse } from '../../../../api/generated/models/practice-material-response';
import type { Flashcard } from '../../../../api/generated/models/flashcard';

@Component({
  selector: 'app-practice-materials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatButtonModule,
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

  protected readonly flashcardIndex = signal(0);
  protected readonly flipped = signal(false);
  protected readonly currentFlashcard = computed(
    (): Flashcard => this.flashcards()[this.flashcardIndex()],
  );

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
    } catch {
      this.errorMessage.set('Could not load practice materials. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

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

  private resolveCourseId(): number {
    let currentRoute: ActivatedRoute | null = this.route;
    while (currentRoute) {
      const id = currentRoute.snapshot.paramMap.get('id');
      if (id) return Number(id);
      currentRoute = currentRoute.parent;
    }
    return Number.NaN;
  }
}
