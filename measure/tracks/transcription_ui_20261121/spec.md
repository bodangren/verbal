# Specification: Transcription in the UI

## Overview

`POST /api/transcribe` runs a real Whisper-compatible transcription into a job and writes `transcript.json` on success, but the page has no way to start one. Every user therefore has to produce a transcript outside the app, which breaks the product's first promise: import media, transcribe it, then edit the text.

## Goals

1. A **Transcribe** control on the page that starts transcription for the open project.
2. Job progress and failures visible in the page, not only in a log.
3. On success, the transcript editor, playback, and cleanup proposals refresh automatically.
4. Verify the whole route with a fake ASR server, not only the pieces.

## Non-Goals

- Local/offline transcription (a separate provider, later track).
- Batch transcription queues.
- Real-time transcription during capture.
- Language selection and provider choice in the UI (the route takes the defaults).
- Re-transcribing without confirmation of the overwrite: out of scope, but the button says that it replaces the transcript.

## Functional Requirements

### FR1: Starting a job
- A *Transcription* panel offers **Transcribe media**.
- It is disabled when there is no open project, no media, or a transcription job is already running.
- Clicking it posts `{ projectRoot }` to `/api/transcribe` and follows the returned job to a terminal state.

### FR2: Progress and failure
- While the job runs, the panel shows its status and percentage.
- A failed job surfaces the job's error message.
- A project whose server has no `OPENAI_API_KEY` surfaces the API's message ("OPENAI_API_KEY is not set") rather than a generic failure.

### FR3: Success
- When the job completes, the page reloads the stored transcript, so the editor, playback screen, and cleanup proposals all show the new words.
- The panel reports the number of transcribed words.

### FR4: Route contract
- `POST /api/transcribe` keeps returning `202` with the created job, `400` with no media, `503` with no key, and `405` for another method.
- The transcript is written only after the provider succeeds.

## Acceptance Criteria

- [ ] A route test with a fake ASR server (via `OPENAI_BASE_URL`) proves a job is created, completes, and stores the returned words.
- [ ] The route returns 503 when no API key is configured.
- [ ] The page exposes the control, reflects progress, and reloads the transcript on success.
- [ ] `npm run e2e` transcribes a real clip against a fake ASR server, then shows the words in the editor and a filler proposal in the cleanup panel.
- [ ] `npm run check` and `npm run e2e` pass.

## Non-Functional Requirements

- Reuse the existing job registry, polling, and `runTranscriptionJob`; no second job mechanism.
- No provider SDK import outside `packages/ai`.
- No new npm dependency.

## Dependencies

- `POST /api/transcribe`, `runTranscriptionJob`, `getJobRegistry` (complete).
- `createWhisperProvider` with `OPENAI_BASE_URL` support for fakes (complete).
- Transcript reload path in the page and the editing hook (complete).

## Open Decisions

- **A separate project in the walkthrough.** The existing walkthrough fixtures a transcript by hand; transcribing over it would invalidate those assertions, so the browser check transcribes into a second project.
- **Overwrite semantics.** Transcription replaces `transcript.json`. The button label says so; merging into an edited transcript is a later problem.
- **Where the key lives.** The server reads `OPENAI_API_KEY` per request, so changing it needs no rebuild.

## Risks

- A long file makes the button feel dead; the panel therefore shows live progress from the job, and the button disables while a job runs.
- Provider failure leaves no transcript: the job error is surfaced and the previous transcript, if any, is untouched because writing happens only on success.
