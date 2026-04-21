/*
 * Copyright (c) 2026 Kris Jordan
 * SPDX-License-Identifier: MIT
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { PageTitleService } from '../../../page-title.service';
import { LayoutNavigationService } from '../../../layout/layout-navigation.service';

/** Landing page listing the available student-facing tools. */
@Component({
  selector: 'app-student-tools',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatCardModule, MatIconModule],
  templateUrl: './student-tools.component.html',
  styleUrl: './student-tools.component.scss',
})
export class StudentTools {
  private titleService = inject(PageTitleService);
  private layoutNavigation = inject(LayoutNavigationService);

  constructor() {
    this.layoutNavigation.clearContext();
    this.titleService.setTitle('Student Tools');
  }
}
