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

- [x] **J1** (M04 FR3): Serialise registry saves and reconcile restarts. 9993e57
      Evidence: 15 tests green in `packages/core/src/jobs.test.ts`; Red showed `step 4` for `step 9`. The restart reason string changed from `interrupted by restart` to `server restarted`.
      Wave 1. Worker: `deepseek/deepseek-flash`.
      Files: `packages/core/src/jobs.ts`, `packages/core/src/jobs.test.ts`.
      Red: Test: ten parallel `update` calls with randomised save delays end with the last call's state on disk. Test: a registry opened over a file with `running` and `queued` jobs marks them `failed: server restarted`.
      Green: Chain saves on one promise queue. Add the reconcile step to `open`.
      Check: `npx vitest run packages/core/src/jobs.test.ts`
- [x] **J2** (H04 FR1+FR2): Register one controller per job and pass the signal through every worker. 2ccf869
      Evidence: 195 core and server tests green. First pass was sent back (signal did not reach `transcribeNow`, no unhandled-rejection test, controllers never removed). Gap: a provider that ignores `signal` still runs to the end; the check runs before the save.
      Wave 2. Worker: `openai/gpt-6-luna`.
      Files: `packages/core/src/jobs.ts`, `apps/web/server/export-job.ts`, `apps/web/server/transcribe-job.ts`, `apps/web/pages/api/transcribe/batch.ts`, `apps/web/pages/api/jobs/[id].ts`, tests (not under `pages/`). Depends on J1 and S1.
      Red: Test: cancel aborts the controller; a fake spawner sees `signal.aborted`. Test: after cancel no output is published and no transcript is saved. Test: batch cancel leaves no unhandled rejection.
      Green: Create the controller in `registry.create`. Expose `registry.signalOf(id)`. Pass it from each runner. Await progress writes. Check `signal.aborted` before publishing.
      Check: `npx vitest run packages/core apps/web/server`
- [x] **J3** (H09 FR4): Stamp media revisions and reject stale transcripts. 20040fb
      Evidence: 86 core and server tests green; 14 Red failures shown with production files stashed. Commit `a582319` swept J3's export route change in half-finished, so `master` did not build between `a582319` and this commit.
      Wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/media-api.ts`, `apps/web/server/transcribe-service.ts`, `packages/core/src/project.ts`, tests. Depends on J2.
      Red: Test: import media B while a transcription of A runs; the A result is dropped. Test: export of a project whose transcript revision differs from the media revision answers 409 with a clear message. Test: an old project without revision opens and is stamped.
      Green: Add `mediaRevision` to the project and transcript documents (optional field, no schema break). Compare at save and at export.
      Check: `npx vitest run packages/core apps/web/server`
- [x] **J3b** (H09 follow-up from J3): Stamp the single transcription job path and check the revision in the storyboard export. f282cbc
      Evidence: 57 service and storyboard tests green; Red showed an unstamped transcript, a stale result saved, and a mismatched export returning 202. The worker called a `transcribe-api.test.ts` failure pre-existing; it was a regression from A5 (cloud extraction now runs ffmpeg), fixed in `496060e`.
      Wave 6. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/transcribe-job.ts`, `apps/web/server/storyboard-api.ts`, tests.
      Red: a transcript saved by `/api/transcribe` carries `mediaRevision`; a storyboard export of mismatched media answers 409.
      Green: reuse `mediaRevisionMismatch` and the stamp helper from J3.

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

## Phase R2: Acceptance fixes (Sol review, 2026-11-27)

The independent acceptance review rejected or conditionally accepted this track. Each task below reopens a finding it verified. Same worker rules as Phase 1.

- [x] **J2b** (H04a (Sol: verified)): Pass the cancellation signal into storyboard rendering and every media subprocess. bd1d28e
      Evidence: 534 server, compose and media tests green; Red showed the signal never reaching the concat or a segment step. The production route moved from `runCommand` to `spawnProcess`; the e2e walkthrough does not run a real storyboard export, so that path is covered by unit tests only.
      wave 1. Worker: `openai/gpt-6-luna`.
      Files: `apps/web/server/storyboard-api.ts`, `packages/compose/src/render-step.ts`, `packages/compose/src/assemble.ts`, tests.
      Red: Test: aborting during concatenation kills the FFmpeg child (fake runner sees `signal.aborted`), publishes no final file and no provenance.
      Green: Thread the registry signal through the render steps and the concat runner; await child exit before cleanup.
- [x] **J2c** (H04b (Sol: verified)): Define one publication boundary so cancel and publish cannot both win. bb5557e
      Evidence: 604 core, media and server tests green; 10 Red failures. Gaps: the two batch-path tests were added after the fix; a storyboard job whose provenance write fails after the rename ends `failed` with a published file.
      wave 2. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/media/src/export.ts`, `apps/web/server/export-job.ts`, `apps/web/server/transcribe-service.ts`, `packages/core/src/jobs.ts`, tests.
      Red: Test: a cancel that arrives after the rename begins is rejected (the job ends `done`), and a cancel that wins prevents the rename and the transcript save. No job reports `cancelled` with a published output.
      Green: Add a `beginPublish(id)` on the registry that returns false when the job is cancelled and locks cancel out afterwards; call it immediately before each publication.
- [x] **J3c** (H09a+H09b (Sol: verified)): Close the remaining revision gaps. ee24a63
      Evidence: 490 core and server tests green; 9 Red failures. A PUT to a project with no `project.json` now answers 404 instead of saving.
      wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/transcribe-service.ts`, `apps/web/server/take-api.ts`, `apps/web/server/capture-api.ts`, `apps/web/pages/api/assembly.ts`, `apps/web/pages/api/transcript.ts`, `packages/core/src/project.ts`, tests.
      Red: Test: a transcription that starts on a project without a revision gets the starting revision computed first, and a later import drops its result. Test: take, capture and assembly media replacement write a new revision. Test: a transcript PUT with a stale revision is rejected.
      Green: One shared `replaceProjectMedia` and one revision comparison used by every path; stamp missing revisions once.

## Phase R3: Acceptance fixes, round 2 (Sol round 2 review, 2026-11-28)

The second independent review verified these defects, some of them caused by the round 2 fixes. Same worker rules as Phase 1.

- [x] **J2d** (R2-H02 (Sol: verified by inspection)): Put assembly and normalise jobs under the registry signal and the publication boundary. 0630cbf
      Evidence: same run. The registry signal now reaches the normalise and assembly children.
      wave 2. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/assembly-job.ts`, `apps/web/server/normalize-job.ts`, tests.
      Red: Test: cancel stops the child process of an assembly and a normalise job; neither publishes after cancel; beginPublish guards their output.
      Green: Use `registry.signalOf` and `beginPublish` as the export jobs do; drop the private controllers.
- [x] **J3d** (R2-H03, R2-M04 (Sol: verified by inspection)): Serialise project mutations and save the capture before it reports done. 5afc163
      Evidence: 512 core and server tests green; Red showed no lock module, capture done before the save and a save failure swallowed. Seven sections are locked. Gaps: `addTake` writes takes.json outside the lock; the import-versus-take race test passed on the old code by timing, so the ten-way serialisation test is the real proof; `onOutput` rides inside the capture request type.
      wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/project-lock.ts` (new), `apps/web/server/transcribe-service.ts`, `take-api.ts`, `capture-api.ts`, `media-api.ts`, tests.
      Red: Test with a delayed store: a concurrent import and take upload end with the newer media reference; a transcript save compares the revision inside the lock; the capture job reports done only after the project save and surfaces a save error.
      Green: One per-project promise queue used by every project mutation; await the capture save.

## Phase R4: Acceptance fixes, final round (Sol and Opus round 3, 2026-11-28)

The third review found no Blocker. These High and Medium findings remain. Same worker rules as Phase 1.

- [x] **J4a** (R3-H01, R3-L02 (Sol: H01 verified by execution)): Put capture under the registry signal and the publication boundary. 2412a5f
      Evidence: 658 core, media and server tests green; Red showed 12 failures (private controller, no beginPublish, save failure ignored). Cleanup left: `capture-registry.ts` `registerCapture` and `clearCapture` are dead code now.
      Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/capture-job.ts`, `apps/web/server/capture-api.ts`, `apps/web/pages/api/capture.ts` (wiring only), tests.
      Red: Test: a cancel that arrives while the project save runs does not delete the recorded file (the job ends done), and a cancel before `beginPublish` removes the partial and saves nothing; the registry signal reaches the capture FFmpeg child; `onOutput` is a job input, not a field of the capture request type.
      Green: Use `registry.signalOf` and `beginPublish` like the export jobs; write a partial file and rename atomically; move `onOutput` out of `CaptureRequest`.
- [x] **J4b** (R3-H02, R3-H03, R3-L01 (Sol: H02 verified by execution)): Lock the take manifest, publish takes under new names, document the lock contract. d0667db
      Evidence: 666 core, media and server tests green; Red showed a lost manifest entry, a replaced take after a failed save, a nested-lock deadlock, and (rework) a deleted canonical file. First pass was sent back for the canonical-name regression. Gaps: if the final rename fails after both saves, the project already points at the canonical path while the file holds the old bytes (the job is failed so the user retries); two concurrent first uploads of the same take id still race on the manifest entry.
      Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/take-api.ts`, `apps/web/server/take-store.ts`, `apps/web/server/normalize-job.ts`, `packages/media/src/publish.ts` (read), `apps/web/server/project-lock.ts`, tests.
      Red: Tests: two concurrent `addTake` calls on an empty manifest keep both takes; a normalise whose project save fails leaves the previous take file and manifest entry intact (the new file is removed); a nested `withProjectLock` on the same root rejects with a clear error instead of deadlocking.
      Green: Run `addTake` inside the project lock; give each normalised take a new file name and commit the manifest reference only after the file is published and the save succeeds; reject re-entry in `withProjectLock`.

## Decision for Daniel: transcripts saved before media revisions existed (R3-M03)

A transcript with no `mediaRevision` is treated as a match for any media, so an old transcript can be stamped with the revision of media it never described. Options: (a) keep it (no data loss, a stale transcript is possible only for projects whose media changed before this build); (b) invalidate unstamped transcripts on first open and offer Transcribe Again (safe, costs a transcription). Recommendation: (a) now, because no production project exists yet; revisit when real projects exist.

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `openai/gpt-6.2-sol`, report-only, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
