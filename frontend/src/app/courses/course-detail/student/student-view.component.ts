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

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly topics = signal<StudentTopicAnalysis[]>([]);

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
  }
}
