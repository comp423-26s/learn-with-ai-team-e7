/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageTitleService } from '../../../../page-title.service';
import { LayoutNavigationService } from '../../../../layout/layout-navigation.service';
import { PracticeService } from '../../tools/practice.service';
import type { ExamPdfHistoryItem } from '../../../../api/generated/models';
import type { PracticeMaterialGenerateResponse } from '../../../../api/generated/models/practice-material-generate-response';
import type { PracticeMaterialResponse } from '../../../../api/generated/models/practice-material-response';
import { Api } from '../../../../api/generated/api';

/** Page where students choose an uploaded exam and generate practice materials for it. */
@Component({
  selector: 'app-generate-practice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './generate-practice.component.html',
  styleUrl: './generate-practice.component.scss',
})
export class GeneratePractice {
  private titleService = inject(PageTitleService);
  private layoutNavigation = inject(LayoutNavigationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(Api);
  private practiceService = inject(PracticeService);

  protected readonly courseId: number;
  protected readonly exams = signal<ExamPdfHistoryItem[]>([]);
  protected readonly loadingExams = signal(true);
  protected readonly loadError = signal('');
  protected readonly selectedUploadId = signal<number | null>(null);
  protected readonly generating = signal(false);
  protected readonly generateError = signal('');

  protected readonly hasExams = computed(() => this.exams().length > 0);
  protected readonly selectedExam = computed(
    () => this.exams().find((e) => e.id === this.selectedUploadId()) ?? null,
  );

  constructor() {
    this.layoutNavigation.clearContext();
    this.titleService.setTitle('Generate Practice Materials');
    this.courseId = Number(this.route.parent?.snapshot.paramMap.get('id'));
    void this.loadExams();
  }

  protected onSelectExam(uploadId: number): void {
    this.selectedUploadId.set(uploadId);
    this.generateError.set('');
  }

  protected async onGenerate(): Promise<void> {
    const uploadId = this.selectedUploadId();
    if (uploadId === null) return;

    this.generating.set(true);
    this.generateError.set('');

    try {
      const result = await this.practiceService.generatePractice(this.courseId, uploadId);
      if (isPracticeMaterialResponse(result)) {
        // Materials already existed — navigate straight to the viewer.
        await this.navigateToPracticeViewer(uploadId);
        return;
      }
      // Job was queued (202) — poll until done.
      await this.pollUntilReady(uploadId);
    } catch {
      this.generateError.set('Failed to generate practice materials. Please try again.');
      this.generating.set(false);
    }
  }

  private async pollUntilReady(
    uploadId: number,
    intervalMs = 2000,
    maxAttempts = 30,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.practiceService.getPractice(this.courseId, uploadId);
        await this.navigateToPracticeViewer(uploadId);
        return;
      } catch {
        // Not ready yet — keep polling.
      }
      if (attempt < maxAttempts - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    this.generateError.set(
      'Practice material generation is taking longer than expected. Please try again later.',
    );
    this.generating.set(false);
  }

  private async navigateToPracticeViewer(uploadId: number): Promise<void> {
    await this.router.navigate(
      ['/courses', this.courseId, 'student', 'tools', 'grading-analyzer', 'practice'],
      { queryParams: { uploadId } },
    );
  }

  private async loadExams(): Promise<void> {
    if (Number.isNaN(this.courseId)) {
      this.loadError.set('Failed to determine the current course.');
      this.loadingExams.set(false);
      return;
    }

    try {
      const { listExamPdfUploads } =
        await import('../../../../api/generated/fn/exam-pd-fs/list-exam-pdf-uploads');
      const uploads: ExamPdfHistoryItem[] = await this.api.invoke(listExamPdfUploads, {
        course_id: this.courseId,
      });
      this.exams.set(uploads);
    } catch {
      this.loadError.set('Failed to load your exam uploads. Please try again.');
    } finally {
      this.loadingExams.set(false);
    }
  }
}

function isPracticeMaterialResponse(
  result: PracticeMaterialGenerateResponse | PracticeMaterialResponse,
): result is PracticeMaterialResponse {
  return 'weak_topics' in result;
}
