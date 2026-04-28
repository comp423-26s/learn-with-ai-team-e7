/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PageTitleService } from '../../../page-title.service';
import { LayoutNavigationService } from '../../../layout/layout-navigation.service';
import { ActivityService } from '../activities/activity.service';
import { GradingAnalyzerService } from '../tools/grading-analyzer.service';
import { StudentDashboardStateService } from './student-dashboard-state.service';
import type { ExamAnalysisSummary } from '../../../api/generated/models/exam-analysis-summary';
import type { TopicSummaryLine } from '../../../api/generated/models/topic-summary-line';

type TopicLabel = 'strength' | 'weakness';

interface StudentTopicAnalysis {
  id: number;
  topic: string;
  label: TopicLabel;
  completionPercent: number;
  feedbackAvailable: boolean;
}

/** Placeholder for student-facing course tools. */
@Component({
  selector: 'app-student-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatProgressBarModule, DecimalPipe],
  templateUrl: './student-view.component.html',
})
export class StudentView {
  private route = inject(ActivatedRoute);
  private titleService = inject(PageTitleService);
  private layoutNavigation = inject(LayoutNavigationService);
  private activityService = inject(ActivityService);
  private gradingAnalyzerService = inject(GradingAnalyzerService);
  private dashboardState = inject(StudentDashboardStateService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly topics = signal<StudentTopicAnalysis[]>([]);
  protected readonly examAnalysis = signal<ExamAnalysisSummary | null>(null);
  protected readonly analysisLoading = signal(false);
  protected readonly overallScore = signal<number | null>(null);

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

  protected readonly analyzedTopicCount = computed(() => this.topics().length);

  protected readonly completionRate = computed(() => {
    const score = this.overallScore();
    if (score !== null) return score;
    const topicList = this.topics();
    if (topicList.length === 0) {
      return 0;
    }

    const completedTopics = topicList.filter((topic) => topic.completionPercent > 0).length;
    return completedTopics / topicList.length;
  });

  protected readonly feedbackCoverage = computed(() => {
    const topicList = this.topics();
    if (topicList.length === 0) {
      return 0;
    }

    const feedbackTopics = topicList.filter((topic) => topic.feedbackAvailable).length;
    return feedbackTopics / topicList.length;
  });

  protected readonly progressRingBackground = computed(
    () => `conic-gradient(var(--mat-sys-primary) ${this.completionRate() * 360}deg, #e5e7eb 0deg)`,
  );

  constructor() {
    this.layoutNavigation.clearContext();
    this.titleService.setTitle('Student Dashboard');
    void this.loadStudentDashboard();
  }

  private async loadStudentDashboard(): Promise<void> {
    const courseId = Number(this.route.parent?.snapshot.paramMap.get('id'));
    if (Number.isNaN(courseId)) {
      this.errorMessage.set('Failed to determine the current course.');
      this.loading.set(false);
      return;
    }

    try {
      const activities = await this.activityService.list(courseId);
      const topicResults = await Promise.all(
        activities.map(async (activity): Promise<StudentTopicAnalysis> => {
          const submission = await this.activityService.getActiveSubmission(courseId, activity.id);
          const hasSubmission = submission !== null;
          const hasFeedback = (submission?.feedback ?? '').trim().length > 0;

          return {
            id: activity.id,
            topic: activity.title,
            label: hasSubmission ? 'strength' : 'weakness',
            completionPercent: hasSubmission ? 100 : 0,
            feedbackAvailable: hasFeedback,
          };
        }),
      );

      this.topics.set(topicResults);
    } catch {
      this.errorMessage.set('Failed to load student dashboard analysis.');
    } finally {
      this.loading.set(false);
    }

    // Load exam analysis — non-fatal; does not affect loading state or error message
    const uploadIdParam = this.route.snapshot.queryParamMap.get('uploadId');
    const uploadId = uploadIdParam ? Number(uploadIdParam) : null;

    if (uploadId !== null && Number.isFinite(uploadId) && uploadId > 0) {
      this.analysisLoading.set(true);
      const analysis = await this.pollForAnalysis(courseId, uploadId);
      if (analysis !== null) {
        this.dashboardState.setAnalysis(courseId, analysis);
      }
      this.applyAnalysis(analysis);
      this.analysisLoading.set(false);
    } else {
      const cached = this.dashboardState.getAnalysis(courseId);
      if (cached) {
        // Use the cached analysis (set by exam-history polling or a prior fetch)
        this.applyAnalysis(cached);
      } else {
        // No cache yet — fetch from backend; only cache when we get real data
        const analysis = await this.gradingAnalyzerService.getLatestAnalysis(courseId);
        if (analysis !== null) {
          this.dashboardState.setAnalysis(courseId, analysis);
        }
        this.applyAnalysis(analysis);
      }
    }
  }

  private applyAnalysis(analysis: ExamAnalysisSummary | null): void {
    this.examAnalysis.set(analysis);
    if (analysis) {
      this.overallScore.set(analysis.overall_score_pct);
      this.topics.set(this.analysisToTopics(analysis));
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

  private async pollForAnalysis(
    courseId: number,
    uploadId: number,
    intervalMs = 2000,
    maxAttempts = 30,
  ): Promise<ExamAnalysisSummary | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const analysis = await this.gradingAnalyzerService.getExamAnalysis(courseId, uploadId);
      if (analysis !== null) return analysis;
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
    return null;
  }
}
