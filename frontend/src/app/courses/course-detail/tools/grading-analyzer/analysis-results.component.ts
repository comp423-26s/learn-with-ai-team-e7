import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageTitleService } from '../../../../page-title.service';
import { GradingAnalyzerService } from '../grading-analyzer.service';

type TopicSummary = {
  topic: string;
  performance: string;
  average_score_pct: number;
};

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
  protected readonly strengths = signal<string[]>([]);
  protected readonly weaknesses = signal<string[]>([]);
  protected readonly needsReview = signal<string[]>([]);
  protected readonly topics = signal<TopicSummary[]>([]);

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
      this.errorMessage.set('Analysis not available yet. Please try again shortly.');
      this.loading.set(false);
      return;
    }

    this.strengths.set(this.readStringArray(analysis, 'strengths'));
    this.weaknesses.set(this.readStringArray(analysis, 'weaknesses'));
    this.needsReview.set(this.readStringArray(analysis, 'needs_review'));
    this.topics.set(this.readTopicSummaries(analysis));
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

  private readStringArray(payload: Record<string, unknown>, key: string): string[] {
    const value = payload[key];
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
  }

  private readTopicSummaries(payload: Record<string, unknown>): TopicSummary[] {
    const value = payload['topic_summaries'];
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => {
        const topic = typeof item['topic'] === 'string' ? item['topic'] : 'Unknown topic';
        const performance =
          typeof item['performance'] === 'string' ? item['performance'] : 'needs_review';
        const averageScore =
          typeof item['average_score_pct'] === 'number' ? item['average_score_pct'] : 0;
        return {
          topic,
          performance,
          average_score_pct: averageScore,
        };
      });
  }
}
