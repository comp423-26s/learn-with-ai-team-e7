/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import {
  Component,
  ChangeDetectionStrategy,
  computed,
  effect,
  inject,
  InjectionToken,
  OnDestroy,
  Signal,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PageTitleService } from '../../../page-title.service';
import { LayoutNavigationService } from '../../../layout/layout-navigation.service';
import { GradingAnalyzerService } from '../tools/grading-analyzer.service';
import { StudentDashboardStateService } from './student-dashboard-state.service';
import type { ExamAnalysisSummary } from '../../../api/generated/models/exam-analysis-summary';
import type { TopicSummaryLine } from '../../../api/generated/models/topic-summary-line';
import { JobUpdateService, type JobUpdate } from '../../../job-update.service';

type TopicLabel = 'strength' | 'weakness';

interface StudentTopicAnalysis {
  id: number;
  topic: string;
  label: TopicLabel;
  completionPercent: number;
  feedbackAvailable: boolean;
}

export interface PollConfig {
  intervalMs: number;
  maxAttempts: number;
}

export const POLL_CONFIG = new InjectionToken<PollConfig>('POLL_CONFIG', {
  providedIn: 'root',
  factory: () => ({ intervalMs: 2000, maxAttempts: 30 }),
});

/** Placeholder for student-facing course tools. */
@Component({
  selector: 'app-student-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatProgressBarModule, DecimalPipe],
  templateUrl: './student-view.component.html',
})
export class StudentView implements OnDestroy {
  private route = inject(ActivatedRoute);
  private titleService = inject(PageTitleService);
  private layoutNavigation = inject(LayoutNavigationService);
  private gradingAnalyzerService = inject(GradingAnalyzerService);
  private dashboardState = inject(StudentDashboardStateService);
  private jobUpdateService = inject(JobUpdateService);
  private pollConfig = inject(POLL_CONFIG);

  private readonly courseId = Number(this.route.parent?.snapshot.paramMap.get('id'));
  private readonly completedExamJobs = new Set<number>();
  private readonly courseUpdates: Signal<ReadonlyMap<number, JobUpdate>> | null;

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly topics = signal<StudentTopicAnalysis[]>([]);
  protected readonly examAnalysis = signal<ExamAnalysisSummary | null>(null);
  protected readonly analysisLoading = signal(false);
  protected readonly overallScore = signal(0);

  protected readonly examAnalysisTopics = computed(() => {
    const analysis = this.examAnalysis();
    if (!analysis) return [];
    return [...analysis.strengths, ...analysis.needs_review, ...analysis.weaknesses];
  });

  protected readonly strengths = computed(() =>
    this.topics()
      .filter((topic) => topic.label === 'strength')
      .slice(0, 3),
  );

  protected readonly weaknesses = computed(() =>
    this.topics()
      .filter((topic) => topic.label === 'weakness')
      .slice(0, 3),
  );

  protected readonly progressRingBackground = computed(
    () => `conic-gradient(var(--mat-sys-primary) ${this.overallScore() * 360}deg, #e5e7eb 0deg)`,
  );

  constructor() {
    this.layoutNavigation.clearContext();
    this.titleService.setTitle('Student Dashboard');
    this.courseUpdates = Number.isNaN(this.courseId)
      ? null
      : this.jobUpdateService.updatesForCourse(this.courseId);

    if (this.courseUpdates !== null) {
      this.jobUpdateService.subscribe(this.courseId);
      effect(() => {
        const updates = this.courseUpdates!();
        let shouldRefresh = false;
        for (const [jobId, update] of updates.entries()) {
          if (!this.isCompletedExamAnalysis(update) || this.completedExamJobs.has(jobId)) {
            continue;
          }
          this.completedExamJobs.add(jobId);
          shouldRefresh = true;
        }
        if (shouldRefresh) {
          void this.refreshLatestAnalysis();
        }
      });
    }

    void this.loadStudentDashboard();
  }

  ngOnDestroy(): void {
    if (!Number.isNaN(this.courseId)) {
      this.jobUpdateService.unsubscribe(this.courseId);
    }
  }

  private async loadStudentDashboard(): Promise<void> {
    if (Number.isNaN(this.courseId)) {
      this.errorMessage.set('Failed to determine the current course.');
      return;
    }

    const uploadIdParam = this.route.snapshot.queryParamMap.get('uploadId');
    const uploadId = uploadIdParam ? Number(uploadIdParam) : null;

    if (uploadId !== null && Number.isFinite(uploadId) && uploadId > 0) {
      this.analysisLoading.set(true);
      const analysis = await this.pollForAnalysis(this.courseId, uploadId);
      if (analysis !== null) {
        this.dashboardState.setAnalysis(this.courseId, analysis);
        this.dashboardState.setAnalysisByUploadId(uploadId, analysis);
        this.applyAnalysis(analysis);
      }
      // Do not fall back to refreshLatestAnalysis when polling times out.
      // Showing a different exam's analysis would be misleading. The WebSocket
      // will call refreshLatestAnalysis once the new exam's job completes.
      this.analysisLoading.set(false);
    } else {
      // No specific upload context: apply cached data immediately for a snappy
      // display, then always refresh from the network so the latest analysis is shown.
      const cached = this.dashboardState.getAnalysis(this.courseId);
      if (cached) {
        this.applyAnalysis(cached);
      }
      await this.refreshLatestAnalysis();
    }
  }

  private applyAnalysis(analysis: ExamAnalysisSummary | null): void {
    this.examAnalysis.set(analysis);
    this.overallScore.set(analysis?.overall_score_pct ?? 0);
    this.topics.set(analysis ? this.analysisToTopics(analysis) : []);
  }

  private async refreshLatestAnalysis(): Promise<void> {
    const analysis = await this.gradingAnalyzerService.getLatestAnalysis(this.courseId);
    if (analysis !== null) {
      this.dashboardState.setAnalysis(this.courseId, analysis);
      this.applyAnalysis(analysis);
    }
  }

  private analysisToTopics(analysis: ExamAnalysisSummary): StudentTopicAnalysis[] {
    const mapTopics = (
      topics: TopicSummaryLine[],
      label: TopicLabel,
      feedbackAvailable: boolean,
      idOffset: number,
    ): StudentTopicAnalysis[] =>
      topics.map((t, i) => ({
        id: -(idOffset + i + 1),
        topic: t.topic,
        label,
        completionPercent: Math.round(t.average_score_pct * 100),
        feedbackAvailable,
      }));

    const sCount = analysis.strengths.length;
    const nCount = analysis.needs_review.length;

    return [
      ...mapTopics(analysis.strengths, 'strength', true, 0),
      ...mapTopics(analysis.needs_review, 'weakness', true, sCount),
      ...mapTopics(analysis.weaknesses, 'weakness', false, sCount + nCount),
    ];
  }

  private isCompletedExamAnalysis(update: JobUpdate): boolean {
    return update.kind === 'exam_analysis' && update.status.toLowerCase() === 'completed';
  }

  private async pollForAnalysis(
    courseId: number,
    uploadId: number,
  ): Promise<ExamAnalysisSummary | null> {
    const { intervalMs, maxAttempts } = this.pollConfig;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const analysis = await this.gradingAnalyzerService.getExamAnalysis(courseId, uploadId);
      if (analysis !== null) return analysis;
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
    return null;
  }
}
