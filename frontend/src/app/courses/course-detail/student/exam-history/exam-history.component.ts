/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatePipe } from '@angular/common';
import { PageTitleService } from '../../../../page-title.service';
import { LayoutNavigationService } from '../../../../layout/layout-navigation.service';
import { Api } from '../../../../api/generated/api';
import { ExamPdfHistoryItem } from '../../../../api/generated/models';

/** Student view showing their exam PDF upload history. */
@Component({
  selector: 'app-exam-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    DatePipe,
  ],
  templateUrl: './exam-history.component.html',
  styleUrl: './exam-history.component.scss',
})
export class ExamHistory {
  private titleService = inject(PageTitleService);
  private layoutNavigation = inject(LayoutNavigationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private api = inject(Api);

  protected readonly courseId: number;
  protected readonly uploads = signal<ExamPdfHistoryItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly displayedColumns = ['filename', 'uploadDate', 'analysis', 'practice'];

  protected readonly hasUploads = computed(() => this.uploads().length > 0);

  constructor() {
    this.layoutNavigation.clearContext();
    this.titleService.setTitle('My Exam History');
    this.courseId = Number(this.route.parent?.parent?.snapshot.paramMap.get('id'));
    this.loadHistory();
  }

  protected navigateToGradingAnalyzer(): void {
    // Navigate to grading analyzer to upload a new exam
    void this.router.navigate(['courses', this.courseId, 'student', 'tools', 'grading-analyzer']);
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
      const items = await this.api.invoke(listExamPdfUploads, {
        course_id: this.courseId,
      });
      this.uploads.set(items);
    } catch (error) {
      console.error('Failed to load exam history:', error);
      this.errorMessage.set('Failed to load your exam history. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
