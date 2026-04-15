import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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
    ReactiveFormsModule, // needed for [formGroup] and (ngSubmit) in the template
    MatButtonModule, // <button mat-flat-button>
    MatFormFieldModule, // <mat-form-field> wrappers
    MatInputModule, // matInput on text/number fields
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
  private fb = inject(FormBuilder);
  private titleService = inject(PageTitleService);

  // course ID pulled from the URL (e.g. /courses/3/tools/grading-analyzer → 3)
  protected readonly courseId: number;

  // signals = reactive state — when these change, Angular updates the UI automatically
  protected readonly selectedFile = signal<File | null>(null); // the PDF the user picked
  protected readonly uploading = signal(false); // true while API call in progress
  protected readonly uploadSuccess = signal(false); // true after a successful upload
  protected readonly errorMessage = signal(''); // error text to show the user

  // the upload form with two fields ... assignmentName and score
  protected readonly form = this.fb.nonNullable.group({
    assignmentName: ['', Validators.required],
    score: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  constructor() {
    this.titleService.setTitle('Grading Analyzer');
    // get to "courses/:id" and read the ID
    this.courseId = Number(this.route.parent?.parent?.snapshot.paramMap.get('id'));
  }

  /** when the user picks a file, validatype and size before storing it. */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; // grab the first selected file
    if (!file) return;

    // reject anything that isn't  PDF
    if (file.type !== 'application/pdf') {
      this.errorMessage.set('Only PDF files are accepted.');
      this.selectedFile.set(null);
      return;
    }

    // reject files over 10MB ... (10 * 1024 * 1024 = 10,485,760 bytes)
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage.set('File must be 10MB or smaller.');
      this.selectedFile.set(null);
      return;
    }

    // if file passed validation, store it and reset error status
    this.errorMessage.set('');
    this.selectedFile.set(file);
  }

  /** when the user clicks Upload, sends the file + form data to the backend */
  protected async onSubmit(): Promise<void> {
    // don't do anything if the form has validation errors or no file was picked
    if (this.form.invalid || !this.selectedFile()) return;

    this.uploading.set(true);
    this.errorMessage.set('');
    try {
      const { assignmentName, score } = this.form.getRawValue() as {
        assignmentName: string;
        score: number;
      };
      await this.gradingAnalyzerService.uploadExam(
        this.courseId,
        this.selectedFile()!, // "!" tells TypeScript we know this isn't null here
        assignmentName,
        score,
      );
      // upload worked — show success state and clear the form
      this.uploadSuccess.set(true);
      this.form.reset();
      this.selectedFile.set(null);
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
    this.form.reset();
  }
}
