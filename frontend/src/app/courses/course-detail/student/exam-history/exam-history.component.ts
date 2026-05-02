/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe, PercentPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PageTitleService } from '../../../../page-title.service';
import { LayoutNavigationService } from '../../../../layout/layout-navigation.service';
import { GradingAnalyzerService } from '../../tools/grading-analyzer.service';
import { AuthService } from '../../../../auth.service';
import { StudentDashboardStateService } from '../student-dashboard-state.service';
import { Api } from '../../../../api/generated/api';
import type { ExamPdfHistoryItem } from '../../../../api/generated/models';
import type { ExamAnalysisSummary } from '../../../../api/generated/models/exam-analysis-summary';

interface ExamHistoryEntry {
  upload: ExamPdfHistoryItem;
  analysis: ExamAnalysisSummary | null;
}

/** Student view showing their exam PDF upload history with inline analysis summaries. */
@Component({
  selector: 'app-exam-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    DatePipe,
    PercentPipe,
  ],
  templateUrl: './exam-history.component.html',
  styleUrl: './exam-history.component.scss',
})
export class ExamHistory {
  private titleService = inject(PageTitleService);
  private layoutNavigation = inject(LayoutNavigationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(Api);
  private gradingAnalyzerService = inject(GradingAnalyzerService);
  private authService = inject(AuthService);
  private dashboardState = inject(StudentDashboardStateService);

  protected readonly user = this.authService.user;
  protected readonly courseId: number;
  protected readonly entries = signal<ExamHistoryEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly pendingUploadId = signal<number | null>(null);

  protected readonly hasEntries = computed(() => this.entries().length > 0);

  private readonly newUploadId: number | null;

  constructor() {
    this.layoutNavigation.clearContext();
    this.titleService.setTitle('My Exam History');
    this.courseId = Number(this.route.parent?.snapshot.paramMap.get('id'));
    const param = this.route.snapshot.queryParamMap.get('uploadId');
    this.newUploadId = param !== null ? Number(param) : null;
    void this.loadHistory();
  }

  protected navigateToGradingAnalyzer(): void {
    void this.router.navigate(['/courses', this.courseId, 'student', 'tools', 'grading-analyzer']);
  }

  private async loadHistory(): Promise<void> {
    if (Number.isNaN(this.courseId)) {
      this.errorMessage.set('Failed to determine the current course.');
      this.loading.set(false);
      return;
    }

    try {
      const { listExamPdfUploads } =
        await import('../../../../api/generated/fn/exam-pd-fs/list-exam-pdf-uploads');
      const uploads: ExamPdfHistoryItem[] = await this.api.invoke(listExamPdfUploads, {
        course_id: this.courseId,
      });

      const entries = await Promise.all(
        uploads.map(async (upload): Promise<ExamHistoryEntry> => {
          if (upload.has_analysis) {
            const analysis = await this.gradingAnalyzerService.getExamAnalysis(
              this.courseId,
              upload.id,
            );
            return { upload, analysis };
          }
          return { upload, analysis: null };
        }),
      );

      this.entries.set(entries);

      // If navigated here after a new upload, start background polling for its analysis.
      const pending = this.newUploadId;
      if (pending !== null && Number.isFinite(pending)) {
        const pendingEntry = entries.find((e) => e.upload.id === pending);
        if (pendingEntry && !pendingEntry.upload.has_analysis) {
          this.pendingUploadId.set(pending);
          void this.pollEntryForAnalysis(pending);
        }
      }
    } catch (error) {
      console.error('Failed to load exam history:', error);
      this.errorMessage.set('Failed to load your exam history. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private async pollEntryForAnalysis(
    uploadId: number,
    intervalMs = 2000,
    maxAttempts = 30,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const analysis = await this.gradingAnalyzerService.getExamAnalysis(this.courseId, uploadId);
      if (analysis !== null) {
        this.entries.update((current) =>
          current.map((e) =>
            e.upload.id === uploadId
              ? { upload: { ...e.upload, has_analysis: true }, analysis }
              : e,
          ),
        );
        this.dashboardState.setAnalysis(this.courseId, uploadId, analysis);
        this.pendingUploadId.set(null);
        return;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    this.pendingUploadId.set(null);
  }
}
