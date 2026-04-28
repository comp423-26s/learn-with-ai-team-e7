import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageTitleService } from '../../../../page-title.service';
import { GradingAnalyzerService } from '../grading-analyzer.service';

/** Page where students upload a graded exam PDF to get AI feedback on their performance. */
@Component({
  selector: 'app-grading-analyzer',
  changeDetection: ChangeDetectionStrategy.OnPush, // only re-render when signals change (better performance)
  imports: [
    ReactiveFormsModule,
    MatButtonModule, // <button mat-flat-button>
    MatIconModule, // <mat-icon>
    MatCardModule, // <mat-card> for the success state
    MatProgressSpinnerModule, // <mat-spinner> while uploading
  ],
  templateUrl: './grading-analyzer.component.html',
  styleUrl: './grading-analyzer.component.scss',
})
export class GradingAnalyzer {
  // services Angular injects for us — we don't create these with "new"
  private gradingAnalyzerService = inject(GradingAnalyzerService);
  private route = inject(ActivatedRoute); // reads the course ID from the URL
  private router = inject(Router);
  private titleService = inject(PageTitleService);

  protected readonly courseId: number;

  // signals = reactive state — when these change, Angular updates the UI automatically
  protected readonly selectedFile = signal<File | null>(null); // the PDF the user picked
  protected readonly uploading = signal(false); // true while API call in progress
  protected readonly uploadSuccess = signal(false); // true after a successful upload
  protected readonly errorMessage = signal(''); // error text to show the user

  constructor() {
    this.titleService.setTitle('Grading Analyzer');
    this.courseId = this.resolveCourseId();
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

  /** when the user picks a file, validatype and size before storing it. */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; // grab the first selected file
    if (!file) return;

    // Accept PDFs by MIME or filename extension (some browsers leave file.type empty).
    const looksLikePdf =
      file.type === 'application/pdf' ||
      file.type === 'application/x-pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!looksLikePdf) {
      this.errorMessage.set('Only PDF files are accepted.');
      this.selectedFile.set(null);
      return;
    }

    // Match backend limit to avoid confusing client/server mismatch.
    if (file.size > 50 * 1024 * 1024) {
      this.errorMessage.set('File must be 50MB or smaller.');
      this.selectedFile.set(null);
      return;
    }

    // if file passed validation, store it and reset error status
    this.errorMessage.set('');
    this.selectedFile.set(file);
  }

  /** when the user clicks Upload, sends the file to the backend */
  protected async onSubmit(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();

    if (!this.selectedFile()) return;

    this.uploading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.gradingAnalyzerService.uploadExam(
        this.courseId,
        this.selectedFile()!, // "!" tells TypeScript we know this isn't null here
      );

      this.uploadSuccess.set(true);
      this.selectedFile.set(null);

      const isStudentToolPath = (this.route.snapshot.routeConfig?.path ?? '').includes(
        'student/tools/grading-analyzer',
      );
      const target = isStudentToolPath
        ? ['/courses', this.courseId, 'student']
        : ['/courses', this.courseId, 'tools', 'grading-analyzer', 'results'];
      const navigated = await this.router.navigate(target, {
        queryParams: { uploadId: result.uploadId },
      });

      if (!navigated) {
        this.errorMessage.set(
          'Upload succeeded, but opening results failed. Please refresh and try again.',
        );
      }
    } catch {
      this.errorMessage.set('Upload failed. Please try again.');
    } finally {
      // always turn off the spinner, whether the upload worked or not
      this.uploading.set(false);
    }
  }

  /** resets everything so the user can upload another file */
  protected onReset(): void {
    this.uploadSuccess.set(false);
    this.errorMessage.set('');
    this.selectedFile.set(null);
  }
}
