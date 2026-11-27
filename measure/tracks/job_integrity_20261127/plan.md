# Plan: Job Integrity (backend review 2026-11-27)

**Status:** NOT STARTED
**Created:** 2026-11-27
**Focus:** Cancellation stops real work, saved job state never goes backwards, a new media file invalidates the old transcript.

**Check command:** targeted `npx vitest run` per task; then `npm run check` and `npm run e2e` through the heavy lock (orchestrator).
**Relation to older tracks:** Replaces and rolls up (the old tracks are archived). Narrows `job_lifecycle_20261122` Phase 1. The SSE and client phases stay in that track.

---

## Worker rules (every task)

- Red first: write the failing test, run it, see it fail for the stated reason, then fix.
- Run only the targeted `npx vitest run <files>` through the heavy lock:
  `HEAVY_PRIORITY=p2 HEAVY_MIN_AVAIL_MB=1500 bash /home/daniebo/Desktop/advantage-pr/scripts/jobs/heavy-run.sh -c '<command>'`.
  The orchestrator runs `npm run check` and `npm run e2e`.
- Touch only the files named in the task. No commits. No edits under `measure/`.
- No test file under `apps/web/pages/` (`pages-hygiene.test.ts` guards this).
- TypeScript `strict`, ESM, argv arrays for subprocesses, no `shell: true`.
- Never run `opencode` or `openchamber`.
- Write prose (comments, errors, copy) in short active sentences.

---

## Phase 1: Implement the findings

Each task is one worker: Red test, Green fix, orchestrator review, orchestrator commit.

- [~] **J1** (M04 FR3): Serialise registry saves and reconcile restarts.
      Wave 1. Worker: `deepseek/deepseek-flash`.
      Files: `packages/core/src/jobs.ts`, `packages/core/src/jobs.test.ts`.
      Red: Test: ten parallel `update` calls with randomised save delays end with the last call's state on disk. Test: a registry opened over a file with `running` and `queued` jobs marks them `failed: server restarted`.
      Green: Chain saves on one promise queue. Add the reconcile step to `open`.
      Check: `npx vitest run packages/core/src/jobs.test.ts`
- [ ] **J2** (H04 FR1+FR2): Register one controller per job and pass the signal through every worker.
      Wave 2. Worker: `openai/gpt-6-luna`.
      Files: `packages/core/src/jobs.ts`, `apps/web/server/export-job.ts`, `apps/web/server/transcribe-job.ts`, `apps/web/pages/api/transcribe/batch.ts`, `apps/web/pages/api/jobs/[id].ts`, tests (not under `pages/`). Depends on J1 and S1.
      Red: Test: cancel aborts the controller; a fake spawner sees `signal.aborted`. Test: after cancel no output is published and no transcript is saved. Test: batch cancel leaves no unhandled rejection.
      Green: Create the controller in `registry.create`. Expose `registry.signalOf(id)`. Pass it from each runner. Await progress writes. Check `signal.aborted` before publishing.
      Check: `npx vitest run packages/core apps/web/server`
- [ ] **J3** (H09 FR4): Stamp media revisions and reject stale transcripts.
      Wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/media-api.ts`, `apps/web/server/transcribe-service.ts`, `packages/core/src/project.ts`, tests. Depends on J2.
      Red: Test: import media B while a transcription of A runs; the A result is dropped. Test: export of a project whose transcript revision differs from the media revision answers 409 with a clear message. Test: an old project without revision opens and is stamped.
      Green: Add `mediaRevision` to the project and transcript documents (optional field, no schema break). Compare at save and at export.
      Check: `npx vitest run packages/core apps/web/server`

## Phase 2: Rolled up from archived tracks

These phases came from older tracks that overlapped this one. The archived plan holds the full Red and Green detail. Read it first, then re-check each claim against the current code, because the code moved on 2026-11-27.

- [ ] **J4** (from `save_export_integrity_20261122` Phase 1): Revision-aware save coordinator.
      Wave 5. Worker: `openai/gpt-6-luna`.
      Detail: `measure/archive/superseded_backend_review_20261127_save_export_integrity_20261122/plan.md`.
      Scope: Delayed-response tests; saved state is acknowledged only for the exact revision saved; shared single-flight saves; navigation, retry and close protection (`use-project-session`).
- [ ] **J5** (from `job_lifecycle_20261122` Phase 2): Move slow work into jobs.
      Wave 5. Worker: `deepseek/deepseek-v4-pro`.
      Detail: `measure/archive/superseded_backend_review_20261127_job_lifecycle_20261122/plan.md`.
      Scope: Early-response tests with blocked fake providers; waveform single-flight; failed copy preserves the old file; atomic import publication; cancellation of late image completion and interrupted import.
- [ ] **J6** (from `job_lifecycle_20261122` Phase 3): Job events (SSE) and one client subscription.
      Wave 6. Worker: `openai/gpt-6-luna`.
      Detail: `measure/archive/superseded_backend_review_20261127_job_lifecycle_20261122/plan.md`.
      Scope: Event payload schema; SSE backed by registry subscriptions with disconnect cleanup; one reusable client subscription; remove `pollJob`; browser test for cancel and reconnect with no restarted work.

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
