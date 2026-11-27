# Spec: Job Integrity

Source: Astra backend review of 2026-11-27 at `c6dc3f4`.

## Problem

- **H04.** `PATCH`/cancel on a job flips its status but does not stop work. Export creates an unregistered controller (`apps/web/server/export-job.ts:18-31`). Transcription passes no signal (`apps/web/server/transcribe-job.ts:30-40`). Batch transcription discards a progress promise that rejects after cancel (`apps/web/pages/api/transcribe/batch.ts:62-74`). The cancel route is `apps/web/pages/api/jobs/[id].ts:27-30`.
- **M04.** Every update saves an independent snapshot. An older save can finish last (`packages/core/src/jobs.ts:93-96,239-272`). Restart recovery leaves queued jobs unchanged.
- **H09.** Import replaces the project media without invalidating the transcript (`apps/web/server/media-api.ts:58-69`). A running transcription can publish old words after the swap (`apps/web/server/transcribe-service.ts:202-208,228-240`).

## Requirements

1. FR1. The registry owns one `AbortController` per job. `cancel(id)` aborts it. Export, transcription and batch pass `signal` into every child process and provider call.
2. FR2. After cancel, a job publishes no output file and no transcript. Its temporary files are removed.
3. FR3. Registry writes run one at a time in call order. A restart marks `running` and unrecoverable `queued` jobs as `failed` with the reason `server restarted`.
4. FR4. Project media carries a revision id (hash of path, size and mtime). A transcript stores the revision it came from. Import writes a new revision. The transcript save and the export check the revision and reject a mismatch with a clear message. The UI keeps working with older projects that have no revision (treat as match once, then stamp).

## Acceptance

- A test with a fake long child process shows the child is killed on cancel.
- A race test shows the last write wins in call order.
- A test shows a transcription started before an import does not overwrite the new media's transcript state.
