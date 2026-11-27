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

- [x] **T1** (H07 FR1+FR3): Windowed feature extraction and seam merge (pure, no worker yet). fe59905
      Evidence: 111 `packages/ai` tests green; Red showed one engine call for the whole signal. Windows 30 s with 1 s overlap; the decoder resets per window. The real-model 90 s seam check is owed to acceptance. Gap: the WAV is still read whole.
      Wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/ai/src/typhoon-features.ts`, `packages/ai/src/typhoon-engine.ts`, `packages/ai/src/typhoon-window.ts` (new), tests. Depends on A3.
      Red: Test: windows of 30 s with 1 s overlap cover the signal with no gap. Test: merge drops duplicate words in the overlap and keeps order. Test: window output equals one-shot output on the sine fixture within the features tolerance.
      Green: Add `planWindows`, `mergeWindowResults`. Run the engine per window with a state reset (document this choice).
      Check: `npx vitest run packages/ai`
- [x] **T2** (H07 FR2+FR4): Run Typhoon in a cancellable worker thread with per-window progress. 6c40f1e
      Evidence: 126 `packages/ai` tests green incl. two real-model worker tests: the Thai sample returned 17 words matching the reference in 1.4 s through the worker, and a main-thread timer ticked more than 5 times. The model was not installed before; it was fetched and its three files match the pinned SHA-256. First pass was sent back (it fell back to blocking in-process code in the built server, and the real-model test was skipped). Open: the built server's worker lookup is not yet proven in the production bundle.
      Wave 4. Worker: `openai/gpt-6-luna`.
      Files: `packages/ai/src/typhoon.ts`, `packages/ai/src/typhoon-worker.ts` (new), tests. Depends on T1.
      Red: Test: a timer on the main thread keeps firing during a fake long job. Test: abort terminates the worker within 1 s. Test: progress events carry window percent.
      Green: Spawn the worker with `new Worker(new URL(...))`, pass the model path and window plan, stream progress through `postMessage`.
      Check: `npx vitest run packages/ai`; real-model smoke only if the model exists, through the heavy lock

## Phase R2: Acceptance fixes (Sol review, 2026-11-27)

The independent acceptance review rejected or conditionally accepted this track. Each task below reopens a finding it verified. Same worker rules as Phase 1.

- [x] **T1b** (H07a (Sol: verified)): Read PCM from disk one window at a time. 4f9a9ac
      Evidence: 140 `packages/ai` tests green; Red showed the provider ignoring the window reader. A measured 30 minute silent WAV grew the process by 116 to 124 MB (limit in the test 150 MB; spec ceiling 600 MB), which is per-window decode churn, not retained audio. The whole-file `readWav` seam stays for older tests.
      wave 1. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/ai/src/typhoon.ts`, `packages/ai/src/typhoon-window.ts`, tests.
      Red: Test: the provider never allocates a Float32Array for the whole file (spy on the reader: each read is at most one window); peak RSS for a 30 minute synthetic WAV stays under 600 MB (measured through the heavy lock; record it).
      Green: Stream the WAV: read the header, then read each window's samples by offset.
- [x] **T1c** (H07b (Sol: verified)): Match words across the overlap and stop planning at the signal end. e56504f
      Evidence: 147 `packages/ai` tests green; Red showed a duplicate, a lost word and 181 words for 180. Real model (Thai sample three times, 5 s windows, 1 s overlap): 48 words merged, 48 in one window, same sequence. Limit: word jitter over 0.3 s can still duplicate one word.
      wave 2. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/ai/src/typhoon-window.ts`, tests.
      Red: Test: a word recognised in both windows with different times (within 0.3 s) is kept once; no window is planned when the previous one already reaches the end. Test with a 90 second synthetic seam.
      Green: Align the two word sequences across the overlap by text and nearest time; drop the duplicate.

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `openai/gpt-6.2-sol`, report-only, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
