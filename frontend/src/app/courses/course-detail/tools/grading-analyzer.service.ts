import { Injectable, inject } from '@angular/core';
import { Api } from '../../../api/generated/api';
import { uploadExamPdf } from '../../../api/generated/fn/exam-pd-fs/upload-exam-pdf';
import type { ExamAnalysisSummary } from '../../../api/generated/models/exam-analysis-summary';

export interface ExamAnalysisResult {
  uploadId: number;
  analysis: ExamAnalysisSummary;
}

/** handle HTTP communication with the grading analyzer API */
@Injectable({ providedIn: 'root' })
export class GradingAnalyzerService {
  private api = inject(Api);

  /** upload graded exam PDF, fetch analysis results, & return both
   *
   * Args:
   * courseId: the course ID for the upload
   * file: the exam PDF file to upload
   *
   * Returns:
   * object with uploadId and structured analysis results, or null if analysis fails
   *
   * Throws:
   * rethrow any HTTP errors from the upload or analysis fetch
   */
  async uploadExam(
    courseId: number,
    file: File,
  ): Promise<{ uploadId: number; analysis: ExamAnalysisSummary | null }> {
    // Upload the PDF file
    const uploadResponse = await this.api.invoke(uploadExamPdf, {
      course_id: courseId,
      body: { file: file as Blob } as unknown as { file: string },
    });

    const uploadId = uploadResponse.id;

    // fetch analysis immediately; if not yet ready, return null
    try {
      // import the get function after API sync
      const { getExamAnalysis } =
        await import('../../../api/generated/fn/exam-pd-fs/get-exam-analysis');

      const analysisResponse = await this.api.invoke(getExamAnalysis, {
        course_id: courseId,
        upload_id: uploadId,
      });

      return {
        uploadId,
        analysis: analysisResponse.analysis_data,
      };
    } catch {
      // if analysis not ready or endpoint doesn't exist yet; return upload without analysis
      return {
        uploadId,
        analysis: null,
      };
    }
  }

  /** retrieve analysis for an uploaded exam PDF. */
  async getExamAnalysis(courseId: number, uploadId: number): Promise<ExamAnalysisSummary | null> {
    try {
      const { getExamAnalysis } =
        await import('../../../api/generated/fn/exam-pd-fs/get-exam-analysis');
      const analysisResponse = await this.api.invoke(getExamAnalysis, {
        course_id: courseId,
        upload_id: uploadId,
      });
      return analysisResponse.analysis_data;
    } catch {
      return null;
    }
  }

  /** fetch the most recent exam analysis for a student in a course, or null if none exists. */
  async getLatestAnalysis(courseId: number): Promise<ExamAnalysisSummary | null> {
    const result = await this.getLatestAnalysisResult(courseId);
    return result?.analysis ?? null;
  }

  /** fetch the most recent exam analysis along with the upload that owns it. */
  async getLatestAnalysisResult(courseId: number): Promise<ExamAnalysisResult | null> {
    try {
      const { listExamPdfUploads } =
        await import('../../../api/generated/fn/exam-pd-fs/list-exam-pdf-uploads');
      const uploads = await this.api.invoke(listExamPdfUploads, { course_id: courseId });
      const latestWithAnalysis = uploads.find((u: { has_analysis: boolean }) => u.has_analysis);
      if (!latestWithAnalysis) return null;
      const analysis = await this.getExamAnalysis(courseId, latestWithAnalysis.id);
      if (analysis === null) return null;
      return { uploadId: latestWithAnalysis.id, analysis };
    } catch {
      return null;
    }
  }
}
