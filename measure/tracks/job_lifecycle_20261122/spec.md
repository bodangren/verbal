# Specification: Job Lifecycle and Events

## Problem

Cancellation can update a job record without stopping its work.
Some slow operations still hold HTTP requests.
The page polls jobs and stops observing them after about five minutes.
Concurrent persistence can restore an older snapshot.
See [F06 and F10–F11](../../review-2026-11-22.md).

## Goals

1. Give each job one real cancellation and settlement lifecycle.
2. Run slow work outside request lifetimes.
3. Deliver progress through events instead of component polling.
4. Preserve correct job state across concurrent updates and restart.

## Non-Goals

- Distributed workers, remote queues, or multi-user scheduling.
- Retrying paid operations automatically.
- New generation providers.
- Using a cancelled job to imply that an external provider refunded its work.

## Functional Requirements

### FR1: Cancellation ownership

- Register one AbortController before work starts.
- Propagate its signal through FFmpeg, Remotion, ASR, image, video, and batch operations.
- Stop local subprocesses and their owned descendants when cancelled.
- Clear abort handles when work settles.
- Block document publication after cancellation.
- A provider that ignores abort cannot attach its late result to a scene.
- Terminal records never return to running or complete after cancellation.
- Cancellation is idempotent for an already cancelled job.
- Distinguish failure from cancellation in UI and persistence.

### FR2: Background operations

- Start image generation, large imports, and uncached waveform rendering as jobs.
- Preserve local dry-run estimates without provider calls.
- Return a job identifier before slow work settles.
- Deduplicate simultaneous requests for the same waveform revision.
- Cache hits remain direct local reads.
- Keep imported project state unchanged when copying fails.
- Define request, progress, and result schemas before changing callers.

### FR3: Event delivery

- Add a same-origin SSE endpoint backed by registry subscriptions.
- Send a current snapshot when the client connects.
- Resume with a current snapshot after reconnect.
- Release server subscriptions when clients disconnect.
- Use one client job subscription outside page business logic.
- Switching projects cannot apply old job results to a new project.
- A job remains observable beyond five minutes.
- Display current step, progress, cancellation, failure, and retry guidance.
- Reconnect does not restart work.

### FR4: Durable registry

- Serialize mutations and writes in the same order.
- Validate stored job records with Zod.
- Treat malformed records as explicit recovery events.
- Reconcile queued and running records on restart without rerunning paid work.
- Ensure one failed store write does not permanently block later recovery.
- Preserve terminal state and ordered progress when several jobs update concurrently.

## Acceptance Criteria

- Cancelling blocked export and ASR jobs aborts the actual runner or provider.
- A late provider result cannot modify a cancelled project's documents.
- Batch cancellation stops new items and aborts the active item.
- Fake image generation and delayed import return before completion.
- Two waveform cache misses start only one render.
- SSE disconnect releases its registry listener.
- SSE reconnect receives the current terminal record without restarting the job.
- An injected clock proves observation beyond five minutes without page polling.
- Reversed filesystem completion cannot persist an older snapshot last.
- Restart reconciles queued and running jobs and leaves done jobs unchanged.
- `npm run check` and the offline browser walkthrough pass.

## Dependencies

- `local_safety_20261122`.
- `save_export_integrity_20261122`.

## Risks

- Killing only a renderer parent can leave Chrome descendants running.
- HMR can reload modules while child processes still exist.
- Some paid providers cannot cancel remote work after acceptance.
- SSE cleanup must work on normal disconnect and server shutdown.
