import { Injectable, inject } from '@angular/core';
import { Api } from '../../../api/generated/api';
import { generatePracticeMaterials } from '../../../api/generated/fn/exam-pd-fs/generate-practice-materials';
import { getPracticeMaterials } from '../../../api/generated/fn/exam-pd-fs/get-practice-materials';
import type { PracticeMaterialGenerateResponse } from '../../../api/generated/models/practice-material-generate-response';
import type { PracticeMaterialResponse } from '../../../api/generated/models/practice-material-response';

@Injectable({ providedIn: 'root' })
export class PracticeService {
  private api = inject(Api);

  /**
   * POST — queues practice material generation for an exam upload.
   * Returns immediately with a job_id and status; poll getPractice() until complete.
   */
  async generatePractice(
    courseId: number,
    uploadId: number,
  ): Promise<PracticeMaterialGenerateResponse | PracticeMaterialResponse> {
    return this.api.invoke(generatePracticeMaterials, {
      course_id: courseId,
      upload_id: uploadId,
    });
  }

  /**
   * GET — fetches completed practice materials for an exam upload.
   * Call this to poll after generatePractice() returns a job_id.
   */
  async getPractice(courseId: number, uploadId: number): Promise<PracticeMaterialResponse> {
    return this.api.invoke(getPracticeMaterials, {
      course_id: courseId,
      upload_id: uploadId,
    });
  }
}
