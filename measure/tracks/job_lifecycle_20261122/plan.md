# Plan: Job Lifecycle and Events

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Make cancellation stop work and make progress observable without page polling.

**Check command:** `npm run check` and `npm run e2e`.
**Dependencies:** `local_safety_20261122`, `save_export_integrity_20261122`.

---

## Phase 1: Durable state and cancellation contract

### Red

- [ ] Add failing registry race and restart tests.
      File: `packages/core/src/jobs.test.ts`.
      Delay saves independently and reopen the real file store.
- [ ] Add failing blocked-work cancellation tests.
      Files: `apps/web/server/export-job.test.ts`,
      `apps/web/server/transcribe-job.test.ts`, `apps/web/server/batch-runner.test.ts`,
      `apps/web/server/jobs-api.test.ts`.
      Assert signal delivery and no late publication.
- [ ] Add a subprocess fixture that starts an owned child before cancellation.
      File: `packages/compose/src/worker.node.test.ts`.
      Assert both processes stop.

**Targeted Red command:** `npx vitest run packages/core/src/jobs.test.ts apps/web/server/export-job.test.ts apps/web/server/transcribe-job.test.ts apps/web/server/batch-runner.test.ts apps/web/server/jobs-api.test.ts packages/compose/src/worker.node.test.ts`.

### Green

- [ ] Define stored-record, cancellation, and result schemas first.
      Files: `packages/core/src/jobs.ts`, `apps/web/server/job-aborts.ts`,
      `apps/web/server/jobs-api.ts`.
- [ ] Serialize registry mutation and persistence; reconcile abandoned queued and running records.
      Files: `packages/core/src/jobs.ts`, `apps/web/server/registry.ts`.
- [ ] Register and propagate controllers through every existing job path.
      Files: `apps/web/server/export-job.ts`, `apps/web/server/transcribe-job.ts`,
      `apps/web/server/batch-runner.ts`, `apps/web/server/storyboard-api.ts`,
      `apps/web/server/video-job.ts`, `apps/web/pages/api/jobs/[id].ts`.
- [ ] Extend existing process and provider adapters with abort propagation.
      Files: `packages/media/src/exec.ts`, `packages/compose/src/worker.ts`,
      `packages/ai/src/local.ts`, `apps/web/server/transcribe-service.ts`.
      Fence all final document writes.

### Verification

- [ ] Run race tests and the real owned-child fixture.
- [ ] Verify cancellation removes temporary work through the publication adapter.
- [ ] Run `npm run check`; commit the phase with restart evidence.

---

## Phase 2: Move remaining slow work into jobs

### Red

- [ ] Add failing early-response tests with blocked fake providers and copy runners.
      Files: `apps/web/server/image-api.test.ts`, `apps/web/server/media-api.test.ts`.
- [ ] Add failing waveform deduplication and failed-copy preservation tests.
      Files: `apps/web/server/waveform-api.test.ts`, `packages/media/src/import.test.ts`.
- [ ] Add cancellation tests for late image completion and interrupted import.
      Files: the image and media service tests.

**Targeted Red command:** `npx vitest run apps/web/server/image-api.test.ts apps/web/server/media-api.test.ts apps/web/server/waveform-api.test.ts packages/media/src/import.test.ts`.

### Green

- [ ] Define asynchronous request and result schemas before adapting the routes.
      Files: `packages/core/src/jobs.ts`, `apps/web/server/image-api.ts`,
      `apps/web/server/media-api.ts`, `apps/web/server/waveform-api.ts`.
- [ ] Implement background work, waveform single-flight, and atomic import publication.
      Files: the service modules, `packages/media/src/import.ts`,
      `apps/web/pages/api/storyboard/generate-image.ts`,
      `apps/web/pages/api/media/import.ts`, `apps/web/pages/api/media/waveform.ts`.
- [ ] Preserve direct dry-run estimates and cached waveform responses.
      Files: the image and waveform service modules.

### Verification

- [ ] Run blocked-operation tests without paid calls.
- [ ] Verify a failed import leaves project metadata and previous media unchanged.
- [ ] Run `npm run check`; commit the phase with HTTP response evidence.

---

## Phase 3: Job events and client subscription

### Red

- [ ] Add failing SSE snapshot, reconnect, and disconnect tests.
      File: `apps/web/server/job-events.test.ts` (new).
- [ ] Add failing client tests for a long job and stale project results.
      File: `apps/web/hooks/use-job-events.test.tsx` (new).
      Use an injected event source and clock.
- [ ] Add a browser test for cancelling a local job and reconnecting without restarting work.
      File: `tools/e2e/walkthrough.mjs`.

**Targeted Red command:** `npx vitest run apps/web/server/job-events.test.ts apps/web/hooks/use-job-events.test.tsx`.

### Green

- [ ] Define the event payload schema before implementing transport.
      Files: `apps/web/server/job-events.ts` (new),
      `apps/web/pages/api/jobs/events.ts` (new).
- [ ] Implement SSE backed by registry subscriptions and disconnect cleanup.
      Files: the event adapter and route.
- [ ] Implement one reusable client subscription.
      File: `apps/web/hooks/use-job-events.ts` (new).
- [ ] Remove `pollJob` and wire job results through the session coordinator.
      Files: `apps/web/pages/index.tsx`, `apps/web/hooks/use-project-session.ts`.
      Keep job business logic outside the page.

### Verification

- [ ] Run event tests and verify listener counts return to baseline.
- [ ] Run `npm run check` and `npm run e2e` through the shared heavy runner.
- [ ] Verify no component polls jobs and no reconnect starts paid work.
- [ ] Obtain independent lifecycle review before acceptance.
- [ ] Commit evidence; update the registry and metadata after acceptance.
