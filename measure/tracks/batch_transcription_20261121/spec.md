# Specification: Batch Transcription

## Overview

Transcription runs one project at a time from the page. A creator with a folder of takes must open each project and press Transcribe, and nothing stops two runs from overlapping. This track plans a batch across projects and runs it one item at a time.

## Goals

1. A pure planner deciding which projects still need transcribing and in what order.
2. A runner that processes the plan sequentially, reporting per-item progress.
3. The page can start a batch and see each item's state.

## Non-Goals

- Parallel transcription: providers rate-limit, and sequential output is easier to reason about.
- Persisting the queue across restarts: the plan is derived from project state on each request, so a restart simply recomputes it.
- Folder discovery in the server: the caller names the projects.
- Cancelling a single item versus the whole batch (only the latter, via the existing job cancel).

## Functional Requirements

### FR1: Planning
- `planBatch({ projects, force })` returns `{ items, skipped }`, ordered as given.
- An item is `skip` when the project already has a transcript and `force` is false; otherwise `transcribe`.
- A project without media is `skip` with reason `no-media`.
- Deduplication: the same root listed twice appears once, at its first position.
- An empty list plans nothing.

### FR2: Running
- The runner transcribes items in order, never two at once.
- A failed item does not stop the batch; it is reported as failed and the next item runs.
- Progress reaches the job registry, so the existing job UI shows it.

### FR3: Endpoint and page
- `POST /api/transcribe/batch` with `{ roots, force? }` returns `{ plan, job }`.
- The page offers a batch field (one root per line) and reports each item's outcome.

## Acceptance Criteria

- [ ] Planner tests cover skip/transcribe decisions, no-media, duplicate roots, ordering, and `force`.
- [ ] Runner tests prove sequential order, that a failure does not abort the batch, and that the summary is reported.
- [ ] `npm run check` and `npm run e2e` pass.

## Dependencies

- Transcribe route and job runner, job registry (complete).
- Fake ASR server used by the walkthrough (complete).

## Risks

- The queue is derived, not stored, so two callers can plan the same work; the sequential runner keeps that harmless, and duplicate roots are collapsed within one request.
