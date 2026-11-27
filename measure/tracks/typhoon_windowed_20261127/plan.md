# Plan: Typhoon Windowed Inference (backend review 2026-11-27)

**Status:** NOT STARTED
**Created:** 2026-11-27
**Focus:** Stop Typhoon from blocking the API process and holding a whole hour of features in memory.

**Check command:** targeted `npx vitest run` per task; then `npm run check` and `npm run e2e` through the heavy lock (orchestrator).
**Relation to older tracks:** Follows `typhoon_integration_20261125` and `asr_hardening_20261127`.

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

- [ ] **T1** (H07 FR1+FR3): Windowed feature extraction and seam merge (pure, no worker yet).
      Wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/ai/src/typhoon-features.ts`, `packages/ai/src/typhoon-engine.ts`, `packages/ai/src/typhoon-window.ts` (new), tests. Depends on A3.
      Red: Test: windows of 30 s with 1 s overlap cover the signal with no gap. Test: merge drops duplicate words in the overlap and keeps order. Test: window output equals one-shot output on the sine fixture within the features tolerance.
      Green: Add `planWindows`, `mergeWindowResults`. Run the engine per window with a state reset (document this choice).
      Check: `npx vitest run packages/ai`
- [ ] **T2** (H07 FR2+FR4): Run Typhoon in a cancellable worker thread with per-window progress.
      Wave 4. Worker: `openai/gpt-6-luna`.
      Files: `packages/ai/src/typhoon.ts`, `packages/ai/src/typhoon-worker.ts` (new), tests. Depends on T1.
      Red: Test: a timer on the main thread keeps firing during a fake long job. Test: abort terminates the worker within 1 s. Test: progress events carry window percent.
      Green: Spawn the worker with `new Worker(new URL(...))`, pass the model path and window plan, stream progress through `postMessage`.
      Check: `npx vitest run packages/ai`; real-model smoke only if the model exists, through the heavy lock

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
