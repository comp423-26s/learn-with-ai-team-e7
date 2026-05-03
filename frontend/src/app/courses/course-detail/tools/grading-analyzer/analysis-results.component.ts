import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { PageTitleService } from '../../../../page-title.service';
import { GradingAnalyzerService } from '../grading-analyzer.service';
import { PracticeService } from '../practice.service';
import { StudentDashboardStateService } from '../../student/student-dashboard-state.service';
import type { TopicSummaryLine } from '../../../../api/generated/models/topic-summary-line';
import type { PracticeMaterialResponse } from '../../../../api/generated/models/practice-material-response';
import type { ExamAnalysisSummary } from '../../../../api/generated/models/exam-analysis-summary';

export const ANALYSIS_POLL_CONFIG = new InjectionToken<{ intervalMs: number; maxAttempts: number }>(
  'ANALYSIS_POLL_CONFIG',
  { providedIn: 'root', factory: () => ({ intervalMs: 2000, maxAttempts: 30 }) },
);

@Component({
  selector: 'app-analysis-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatButtonModule, MatProgressSpinnerModule, MatIconModule, RouterLink],
  templateUrl: './analysis-results.component.html',
  styleUrl: './analysis-results.component.scss',
})
export class AnalysisResultsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gradingAnalyzerService = inject(GradingAnalyzerService);
  private readonly practiceService = inject(PracticeService);
  private readonly titleService = inject(PageTitleService);
  private readonly dashboardState = inject(StudentDashboardStateService);
  private readonly pollConfig = inject(ANALYSIS_POLL_CONFIG);

  // ── existing signals ──────────────────────────────────────────────────────
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

  protected readonly generatingPractice = signal(false);
  protected readonly practiceError = signal('');

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

    let analysis = await this.pollForAnalysis(uploadId);

    // if polling timed out, try dashboard cache as fallback keyed by upload id
    if (!analysis) {
      analysis = this.dashboardState.getAnalysisByUploadId(uploadId) ?? null;
    }

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

  protected async onGeneratePractice(): Promise<void> {
    const uploadId = this.uploadId();
    if (uploadId === null) return;

    this.generatingPractice.set(true);
    this.practiceError.set('');

    try {
      await this.practiceService.generatePractice(this.courseId, uploadId);
      await this.pollUntilComplete(uploadId);

      const isStudentPath = this.route.snapshot.pathFromRoot
        .map((s) => s.routeConfig?.path ?? '')
        .join('/')
        .includes('student');

      const target = isStudentPath
        ? ['/courses', this.courseId, 'student', 'tools', 'grading-analyzer', 'practice']
        : ['/courses', this.courseId, 'tools', 'grading-analyzer', 'practice'];

      const navigated = await this.router.navigate(target, {
        queryParams: { uploadId },
      });

      if (!navigated) {
        this.practiceError.set(
          'Materials generated, but opening them failed. Please refresh and try again.',
        );
      }
    } catch {
      this.practiceError.set('Could not generate practice materials. Please try again.');
    } finally {
      this.generatingPractice.set(false);
    }
  }

  private async pollForAnalysis(uploadId: number): Promise<ExamAnalysisSummary | null> {
    const { intervalMs, maxAttempts } = this.pollConfig;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const analysis = await this.gradingAnalyzerService.getExamAnalysis(this.courseId, uploadId);
      if (analysis !== null) return analysis;
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
    return null;
  }

  private async pollUntilComplete(
    uploadId: number,
    intervalMs = 2000,
    maxAttempts = 30,
  ): Promise<PracticeMaterialResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await this.practiceService.getPractice(this.courseId, uploadId);

        if (result.id) return result;
      } catch {
        // not ready yet — keep polling
      }
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for practice materials');
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
