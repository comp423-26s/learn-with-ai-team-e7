# LearnWithAI — Feature Implementation Guide

This document explains how the two features implemented in Sprints 1 and 2 work across every layer of the stack. It is written for a developer who wants to understand or extend this work.

## Authors

| Name           | GitHub                                             |
| -------------- | -------------------------------------------------- |
| Bettina George | [@BettinaGeorge](https://github.com/BettinaGeorge) |
| Celine Keles   | [@ceseke](https://github.com/ceseke)               |
| Ishi Varshney  | [@ishiv101](https://github.com/ishiv101)           |
| Tiffany Meng   | [@ttmeng](https://github.com/ttmeng)               |

---

## Feature Overview

**In Your Own Words (IYOW)** is an assignment type where an instructor writes a question prompt and a private scoring rubric. Once the activity is released, enrolled students submit a written response. A background worker immediately sends the response and rubric to Azure OpenAI, which returns encouraging and constructive feedback. The student sees that feedback appear in real time through a WebSocket connection — no page refresh needed.

The **Grading Analyzer** is a student-facing tool. A student uploads a graded exam PDF. The backend extracts text from the PDF and passes it to an AI model, which returns a structured breakdown of performance by topic. The student's dashboard shows an overall score, topic strengths, and areas to review. From the same upload, the student can generate AI-produced flashcards targeting their weak topics.

---

## Repository Layout

```
frontend/                   Angular 19 single-page application
api/                        FastAPI adapter — HTTP routes only, no business logic
packages/
  learnwithai-core/         shared Python package — tables, repositories, services, jobs
  learnwithai-jobqueue/     Dramatiq + RabbitMQ adapter for background jobs
```

Both `api/` and the worker process import `learnwithai-core`. All business logic, database tables, and services belong there, not in `api/`.

---

## Frontend

### Routing

All feature routes are children of `/courses/:id` and are lazy-loaded:

```
/courses/:id/activities                          → activity list
/courses/:id/activities/create-iyow              → instructor create form
/courses/:id/activities/:activityId              → instructor detail + roster
/courses/:id/activities/:activityId/edit         → instructor edit form
/courses/:id/activities/:activityId/submit       → student submission + feedback
/courses/:id/activities/:activityId/submissions/:pid → submission detail

/courses/:id/tools/grading-analyzer              → PDF upload (instructor path)
/courses/:id/tools/grading-analyzer/results      → analysis results
/courses/:id/student                             → student dashboard
/courses/:id/student/tools/grading-analyzer      → PDF upload (student path)
/courses/:id/student/tools/grading-analyzer/practice → flashcard practice
```

### Key Components

**`Activities`** fetches the activity list and the user's membership in parallel. Instructors see all activities plus a submission count column. Students see only released activities and are linked directly to the submit page.

**`CreateIyow` / `EditIyow`** are reactive forms covering title, prompt, rubric, release date, due date, and an optional late date. On success, a snackbar notification appears and the router navigates back to the activity list.

**`IyowSubmit`** handles the full student submission lifecycle. It loads the activity and the student's active submission together on mount. If a submission exists with a `pending` or `processing` job, the component registers a WebSocket effect via `JobUpdateService`. When the job reaches `completed` or `failed`, it automatically re-fetches the submission so the AI feedback appears without a page reload. Students can resubmit any time before the deadline; the previous submission is deactivated.

**`GradingAnalyzer`** validates a picked file client-side (PDF type and ≤ 50 MB) before uploading. After a successful upload it navigates to the results page with the `uploadId` as a query param. Both the instructor and student paths load this same component; the component checks its active route to decide where to send the user afterward.

![Grading Analyzer — upload step](docs/images/examupload 2.png)
![Grading Analyzer — Analyzer step](docs/images/strengthsandweaknesses.png)

**`StudentView`** is the student dashboard. When reached with an `uploadId` query param it polls the analysis endpoint every two seconds for up to 30 attempts while displaying a spinner. It also listens on the WebSocket for `exam_analysis` job completions so the dashboard refreshes automatically. The result is a progress ring for overall score and a topic list labeled as strengths, needs review, or weak.

![Student dashboard — analysis results](docs/images/studentdashboard.png)

**`PracticeMaterialsComponent`** loads flashcards for a given `uploadId` and presents them as a flip-card interface with Previous / Flip / Next controls.

![Practice materials — flashcards](docs/images/flashcards.png)

### Frontend Services

**`ActivityService`** wraps every activity and submission API call with typed methods: `createIyow()`, `submitIyow()`, `getActiveSubmission()`, `listSubmissionsRoster()`, and others.

**`GradingAnalyzerService`** handles PDF uploads, fetches analysis by upload ID, and exposes `getLatestAnalysis()` which finds the most recent upload that already has a completed analysis.

**`JobUpdateService`** keeps a single WebSocket connection per course, reference-counted with `subscribe()` / `unsubscribe()`. It exposes `updateForJob(jobId)` and `updatesForCourse(courseId)` as Angular signals that components react to via `effect()`.

---

## Backend — API Layer

All routes are mounted under `/api`. Route handlers stay thin — they validate the request, call a service, and return a response model.

### Activity Routes

| Method   | Path                                                                              | Notes                                                                   |
| -------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET`    | `/courses/{course_id}/activities`                                                 | Students see released only; instructors see all with submission counts. |
| `POST`   | `/courses/{course_id}/activities/iyow`                                            | Creates activity. Instructor/TA only. Returns 201.                      |
| `GET`    | `/courses/{course_id}/activities/{activity_id}`                                   | Rubric is omitted from the response for students.                       |
| `PUT`    | `/courses/{course_id}/activities/{activity_id}`                                   | Updates title, prompt, rubric, and dates.                               |
| `DELETE` | `/courses/{course_id}/activities/{activity_id}`                                   | Instructor only. Returns 204.                                           |
| `POST`   | `/courses/{course_id}/activities/{activity_id}/submissions`                       | Deactivates prior submission, enqueues feedback job. Returns 202.       |
| `GET`    | `/courses/{course_id}/activities/{activity_id}/submissions`                       | Staff see all active; students see their own history.                   |
| `GET`    | `/courses/{course_id}/activities/{activity_id}/submissions/roster`                | Instructor only. All enrolled students with or without a submission.    |
| `GET`    | `/courses/{course_id}/activities/{activity_id}/submissions/active`                | Returns the student's current active submission, or null.               |
| `GET`    | `/courses/{course_id}/activities/{activity_id}/submissions/history/{student_pid}` | Instructor only. Full history for one student.                          |

### Exam PDF and Practice Routes

| Method | Path                                                  | Notes                                                                 |
| ------ | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `POST` | `/courses/{course_id}/exam-pdfs`                      | Validates content type, extension, size, and PDF header. Returns 202. |
| `GET`  | `/courses/{course_id}/exam-pdfs`                      | Lists the authenticated student's uploads, newest first.              |
| `GET`  | `/courses/{course_id}/exam-pdfs/{upload_id}/analysis` | Returns `ExamAnalysisSummary`. Returns 404 if analysis is not ready.  |
| `POST` | `/courses/{course_id}/exam-pdfs/{upload_id}/practice` | Idempotent. Returns cached materials (200) or queues a new job (202). |
| `GET`  | `/courses/{course_id}/exam-pdfs/{upload_id}/practice` | Returns generated flashcards and topic list.                          |

### Key Request and Response Models

**Activity:**

| Model                       | Key Fields                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `CreateIyowActivityRequest` | `title`, `prompt`, `rubric`, `release_date`, `due_date`, `late_date?`                    |
| `IyowActivityResponse`      | above fields plus `id`, `course_id`, `type`, `created_at`; `rubric` is null for students |
| `SubmitIyowRequest`         | `response_text`                                                                          |
| `IyowSubmissionResponse`    | `response_text`, `feedback?`, `job?` (`AsyncJobInfo` with `id`, `status`)                |
| `StudentSubmissionRow`      | `student_pid`, `given_name`, `family_name`, `email`, `submission?`                       |

**Exam PDF / Practice:**

| Model                      | Key Fields                                                               |
| -------------------------- | ------------------------------------------------------------------------ |
| `ExamPdfUploadResponse`    | `id`, `storage_key`, `original_filename`, `job?`                         |
| `ExamPdfHistoryItem`       | `id`, `original_filename`, `uploaded_at`, `has_analysis`, `has_practice` |
| `ExamPdfAnalysisResponse`  | `upload_id`, `analysis_data` (`ExamAnalysisSummary`)                     |
| `PracticeMaterialResponse` | `upload_id`, `weak_topics`, `flashcards`                                 |

### Dependency Injection and Transactions

Routes declare dependencies as annotated type aliases defined in `api/src/api/di.py` — for example, `IyowActivityServiceDI`. FastAPI resolves and injects these automatically. Route handlers must never call `session.commit()` or `session.rollback()`; the `get_session()` dependency commits after a successful response and rolls back on any exception.

---

## Backend — Core Package

All business logic lives in `packages/learnwithai-core/src/learnwithai/`.

### IYOW Services

`IyowActivityService` (`activities/iyow/service.py`) authorizes the caller as instructor or TA before any write. Creating an activity writes two rows atomically: one to `activity` (the base table shared by all activity types) and one to `iyow_activity` (the IYOW-specific prompt and rubric).

`IyowSubmissionService` (`activities/iyow/submission_service.py`) owns the full submission lifecycle. When `submit()` is called it validates the caller is a course member and the activity is within its window, deactivates any prior active submission, creates a `Submission` row, creates an `AsyncJob` row with `kind="iyow_feedback"`, creates an `IyowSubmission` row linking the two, and enqueues an `IyowFeedbackJob`. All writes happen in the same session and commit or roll back together.

### Exam Analysis and Practice Material Services

`ExamAnalysisService` (`services/exam_analysis_service.py`) sends the raw extracted PDF text to the AI model with a structured prompt asking for 3–5 topic categories, a mapping of every question to a topic, and performance labels (`strong`, `needs_review`, `weak`). If the model response cannot be parsed as valid JSON matching the expected schema, the service falls back to a keyword-extraction algorithm that derives topics from the most frequent words in the exam text.

`summarize_analysis()` converts the detailed internal analysis into the `ExamAnalysisSummary` the API returns, guaranteeing at least one strength and one weakness entry even if the model returns a uniform performance classification.

`PracticeMaterialService` (`services/practice_material_service.py`) reads the weak and needs-review topics from the completed analysis and the extracted exam text, then asks the AI for 5 flashcards per weak topic. The JSON response is validated and stored in the `practice_material` table. Calling the endpoint a second time returns the cached record immediately rather than re-generating.

### Background Job Handlers

`IyowFeedbackJobHandler` (`activities/iyow/job.py`) runs in the Dramatiq worker. It loads the `IyowSubmission`, walks the foreign-key chain to `IyowActivity` to get the rubric, calls `AiCompletionService.complete()` with a system prompt that embeds the rubric but explicitly forbids revealing it, writes the feedback string back to `iyow_submission.feedback`, and marks the job completed.

`PracticeMaterialJobHandler` (`services/exam_analysis_job.py`) follows the same pattern using `PracticeMaterialService.generate_materials()`.

The base class `BaseJobHandler` manages the session lifecycle, the `PROCESSING` status transition, commit/rollback, and publishing a status update to RabbitMQ so the WebSocket layer can push it to the browser.

### AI Completion Service

`AiCompletionService` (`services/ai_completion_service.py`) wraps the OpenAI Python SDK configured for Azure. Its single public method, `complete(system_prompt, user_prompt)`, calls the chat completions endpoint and returns the model's response as a string. Every AI-backed feature routes through this wrapper.

| Environment Variable                       | Default                            | Purpose               |
| ------------------------------------------ | ---------------------------------- | --------------------- |
| `OPENAI_API_KEY` / `AZURE_OPENAI_API_KEY`  | —                                  | Azure API key         |
| `OPENAI_MODEL` / `AZURE_OPENAI_DEPLOYMENT` | `gpt-5-mini`                       | Model deployment name |
| `OPENAI_ENDPOINT`                          | `https://azureaiapi.cloud.unc.edu` | Azure endpoint        |
| `OPENAI_API_VERSION`                       | `2025-04-01-preview`               | API version           |

---

## Database

The database is PostgreSQL accessed through SQLModel. The feature adds the following tables on top of the existing scaffold:

```
activity              base record for all activity types
  └── iyow_activity   1:1 — prompt and rubric

submission            base record for all submission types
  └── iyow_submission 1:1 — response_text, feedback, async_job_id

async_job             unified job tracking for all background work

exam_pdf_upload       one row per uploaded PDF (stores analysis_data as JSON)
  ├── exam_pdf_text   1:1 — extracted text
  └── practice_material 1:1 — generated flashcards stored as JSON
```

Key design decisions worth noting:

- `iyow_submission.feedback` starts as `null` and is filled in by the background worker. The frontend uses this null check to decide whether to show a spinner.
- `exam_pdf_upload.analysis_data` stores the full `ExamPerformanceAnalysis` JSON directly on the upload row rather than in a separate table, which keeps the read path for the analysis endpoint to a single query.
- `async_job` is a single unified table for every job kind, discriminated by the `kind` column (`"iyow_feedback"`, `"exam_analysis"`, `"practice_material"`). The `input_data` and `output_data` columns carry job-type-specific JSON payloads.
- Only one submission per student per activity is active at a time. Resubmitting flips `is_active` to false on the previous row before creating a new one.

---

## AI Integration

The same pattern drives all three AI-backed operations. The route handler creates an `AsyncJob` record in `PENDING` status, enqueues the job payload, and returns HTTP 202 immediately. The Dramatiq worker picks up the job, calls `AiCompletionService.complete()`, writes the result to the database, and publishes a status notification. The browser receives the notification over WebSocket and updates the UI without a reload.

### IYOW Feedback

```
Student submits → POST /courses/{id}/activities/{id}/submissions
  IyowSubmissionService creates Submission + IyowSubmission + AsyncJob, enqueues job
  → 202 returned to browser

Worker: IyowFeedbackJobHandler
  → fetches rubric from IyowActivity, calls AiCompletionService.complete()
  → writes feedback to iyow_submission.feedback
  → marks AsyncJob COMPLETED, publishes WebSocket update

Browser receives update → IyowSubmit refreshes submission → feedback appears
```

### Exam Analysis

```
Student uploads PDF → POST /courses/{id}/exam-pdfs
  ExamPdfService stores file, creates ExamPdfUpload + ExamPdfText + AsyncJob, enqueues job
  → 202 returned

Worker: ExamAnalysisJobHandler
  → calls ExamAnalysisService.analyze_from_text() with extracted text
  → AI returns topic/performance JSON (fallback to keyword extraction if invalid)
  → writes analysis to exam_pdf_upload.analysis_data
  → marks AsyncJob COMPLETED

StudentView polls GET /courses/{id}/exam-pdfs/{upload_id}/analysis every 2s
  → ExamAnalysisService.summarize_analysis() produces ExamAnalysisSummary
  → dashboard renders score ring and topic list
```

### Practice Materials

```
Student clicks "Generate Practice Materials" → POST /courses/{id}/exam-pdfs/{upload_id}/practice
  If cached materials exist → returns 200 immediately
  Otherwise creates AsyncJob, enqueues PracticeMaterialJob → 202

Worker: PracticeMaterialJobHandler
  → PracticeMaterialService reads weak topics + exam text
  → AI returns 5 flashcards per weak topic as JSON
  → upserts PracticeMaterial row
  → marks AsyncJob COMPLETED

Frontend fetches GET /courses/{id}/exam-pdfs/{upload_id}/practice
  → PracticeMaterialsComponent renders flip-card flashcard interface
```

---

## End-User Walkthrough

### Instructor: Creating an IYOW Activity

An instructor opens the **Activities** tab and clicks **Create Activity**. The form collects a title, the prompt students will see, a private rubric the AI uses to calibrate its feedback (never shown to students), and release and due dates with an optional late date.

![Create IYOW activity form](images/create-iyow-form.png)

Once saved, the activity appears in the list. The instructor sees a submission count column; the activity is hidden from students until the release date passes.

![Activity list — instructor view](images/activity-list-instructor.png)

### Student: Submitting to an IYOW Activity

Students see only released activities. Clicking one opens the submission page with a text editor. After submitting, a spinner shows while the AI generates feedback — typically a few seconds. Feedback renders inline using markdown formatting.

![IYOW submit page — feedback received](images/iyow-submit-feedback.png)

Students can revise and resubmit any time before the deadline. Each resubmission starts a fresh AI feedback job.

### Student: Using the Grading Analyzer

From **Student Tools**, the student selects **Grading Analyzer** and picks a graded exam PDF from their device. The form validates file type and size before uploading.

![Grading Analyzer — upload step](images/grading-analyzer-upload.png)

After upload, the student dashboard polls for the analysis result. Once ready, it shows an overall score ring and a topic breakdown.

![Student dashboard — analysis results](images/student-dashboard.png)

From there, the student can generate practice materials. The backend produces flashcards targeting their weak topics; the frontend presents them as a flip-card interface.

![Practice materials — flashcards](images/practice-materials.png)

---

## Testing

Backend tests live in `packages/learnwithai-core/test/` and `api/test/`. Run them from the repo root:

```bash
uv run pytest packages/learnwithai-core/test
uv run pytest api/test
```

Frontend unit tests use Vitest (`.spec.ts` files alongside components) and end-to-end tests use Playwright under `frontend/e2e/`:

```bash
pnpm test:ci      # unit tests with coverage
pnpm test:e2e     # Playwright headless
```

Both backend and frontend require 100% test coverage.
