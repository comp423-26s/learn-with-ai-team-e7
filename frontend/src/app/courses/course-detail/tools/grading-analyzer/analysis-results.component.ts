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
import { PageTitleService } from '../../../../page-title.service';
import { GradingAnalyzerService } from '../grading-analyzer.service';
import type { TopicSummaryLine } from '../../../../api/generated/models/topic-summary-line';

@Component({
  selector: 'app-analysis-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatButtonModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './analysis-results.component.html',
  styleUrl: './analysis-results.component.scss',
})
export class AnalysisResultsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly gradingAnalyzerService = inject(GradingAnalyzerService);
  private readonly titleService = inject(PageTitleService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly headline = signal('');
  protected readonly strengths = signal<TopicSummaryLine[]>([]);
  protected readonly weaknesses = signal<TopicSummaryLine[]>([]);
  protected readonly needsReview = signal<TopicSummaryLine[]>([]);
  protected readonly topics = computed(() => [
    ...this.strengths(),
    ...this.needsReview(),
    ...this.weaknesses(),
  ]);

  protected readonly courseId: number;
  protected readonly uploadId = signal<number | null>(null);

  constructor() {
    this.titleService.setTitle('Exam Analysis Results');
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

    this.uploadId.set(uploadId);

    const analysis = await this.gradingAnalyzerService.getExamAnalysis(this.courseId, uploadId);
    if (analysis === null) {
      this.errorMessage.set(
        'Something went wrong processing your exam. Please try uploading again.',
      );
      this.loading.set(false);
      return;
    }

    this.headline.set(analysis.headline);
    this.strengths.set(analysis.strengths);
    this.weaknesses.set(analysis.weaknesses);
    this.needsReview.set(analysis.needs_review);
    this.loading.set(false);
  }

  private resolveCourseId(): number {
    let currentRoute: ActivatedRoute | null = this.route;

    while (currentRoute) {
      const id = currentRoute.snapshot.paramMap.get('id');
      if (id) {
        return Number(id);
      }
      currentRoute = currentRoute.parent;
    }

    return Number.NaN;
  }
}
