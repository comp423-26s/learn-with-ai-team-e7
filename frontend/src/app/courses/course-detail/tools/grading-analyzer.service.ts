import { Injectable, inject } from '@angular/core';
import { Api } from '../../../api/generated/api';

/** Handles HTTP communication with the grading analyzer API. */
@Injectable({ providedIn: 'root' })
export class GradingAnalyzerService {
  private api = inject(Api);

  /** Uploads a graded exam PDF and returns the new submission ID.
   *  TODO: replace the stub below with the real generated API call once the backend is ready. */
  async uploadExam(
    courseId: number,
    file: File,
    assignmentName: string,
    score: number,
  ): Promise<{ submissionId: number }> {
    console.log('Uploading exam for course', courseId, assignmentName, score, file.name);
    return Promise.resolve({ submissionId: 1 });
  }
}
