import { Injectable, inject } from '@angular/core';
import { Api } from '../../../api/generated/api';
import { uploadExamPdf } from '../../../api/generated/fn/exam-pd-fs/upload-exam-pdf';

/** Handles HTTP communication with the grading analyzer API. */
@Injectable({ providedIn: 'root' })
export class GradingAnalyzerService {
  private api = inject(Api);

  /** Uploads a graded exam PDF, fetches analysis results, and returns both.
   *
   * Args:
   * courseId: The course ID for the upload
   * file: The exam PDF file to upload
   *
   * Returns:
   * An object with uploadId and structured analysis results, or null if analysis fails
   *
   * Throws:
   * - Rethrows any HTTP errors from the upload or analysis fetch
   */
  async uploadExam(
    courseId: number,
    file: File,
  ): Promise<{ uploadId: number; analysis: Record<string, unknown> | null }> {
    // Upload the PDF file
    const uploadResponse = await this.api.invoke(uploadExamPdf, {
      course_id: courseId,
      body: { file: file as Blob } as unknown as { file: string },
    });

    const uploadId = uploadResponse.id;

    // Try to fetch analysis immediately; if not yet ready, return null
    try {
      // Dynamically import the get function after API sync
      const { getExamAnalysis } =
        await import('../../../api/generated/fn/exam-pd-fs/get-exam-analysis');

      const analysisResponse = await this.api.invoke(getExamAnalysis, {
        course_id: courseId,
        upload_id: uploadId,
      });

      return {
        uploadId,
        analysis: analysisResponse.analysis_data as Record<string, unknown>,
      };
    } catch {
      // Analysis not ready or endpoint doesn't exist yet; return upload without analysis
      return {
        uploadId,
        analysis: null,
      };
    }
  }

  /** Retrieves persisted analysis for an uploaded exam PDF. */
  async getExamAnalysis(
    courseId: number,
    uploadId: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { getExamAnalysis } =
        await import('../../../api/generated/fn/exam-pd-fs/get-exam-analysis');
      const analysisResponse = await this.api.invoke(getExamAnalysis, {
        course_id: courseId,
        upload_id: uploadId,
      });
      return analysisResponse.analysis_data as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
