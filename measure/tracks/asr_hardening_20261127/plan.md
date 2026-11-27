# Plan: ASR Hardening (backend review 2026-11-27)

**Status:** NOT STARTED
**Created:** 2026-11-27
**Focus:** Thai-safe cleanup, correct language choice, private scratch files, resumable model download, audio-only cloud upload.

**Check command:** targeted `npx vitest run` per task; then `npm run check` and `npm run e2e` through the heavy lock (orchestrator).
**Relation to older tracks:** Follows `typhoon_integration_20261125`. Narrows `repository_contracts_20261122` Phase 3 (scratch directories).

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

- [~] **A1** (H02 FR1): Keep Thai letters in cleanup normalisation.
      Wave 1. Worker: `opencode/hy4-flash-free`.
      Files: `packages/cleanup/src/detect.ts`, `packages/cleanup/src/detect.test.ts`.
      Red: Test: five different Thai words give zero stutter proposals. Test: the same Thai word twice gives one stutter proposal. Test: punctuation-only tokens never match each other. Test: English `Um,` and `umm` still match.
      Green: Use `/[^\p{L}\p{M}\p{N}]/gu`. Skip empty `norm` in the stutter and repetition passes.
      Check: `npx vitest run packages/cleanup`
- [~] **A2** (M06 FR2): Pick the engine from the requested language.
      Wave 1. Worker: `opencode/hy4-flash-free`.
      Files: `apps/web/server/asr-resolve.ts`, `apps/web/server/asr-resolve.test.ts`.
      Red: Test: Typhoon installed, `VERBAL_ASR_LANGUAGE=en`, whisper available -> whisper. Test: language unset -> typhoon. Test: `th` -> typhoon. Test: `en` and no whisper -> clear `none` state, not a silent Thai run.
      Green: Move the language read above the Typhoon branch.
      Check: `npx vitest run apps/web/server/asr-resolve.test.ts`
- [~] **A3** (M05 FR3): Private scratch directory for each local ASR call.
      Wave 1. Worker: `opencode-go/mimo-v2.6-flash`.
      Files: `packages/ai/src/local.ts`, `packages/ai/src/local.test.ts`, `packages/ai/src/typhoon.ts`, `packages/ai/src/typhoon.test.ts`.
      Red: Test: two concurrent calls write to different directories. Test: the directory is removed after success, failure and abort. Test: a read-only source folder works.
      Green: `mkdtemp` per call, `rm(recursive)` in `finally`. Keep the argv builders pure.
      Check: `npx vitest run packages/ai`
- [ ] **A4** (M07 FR4): Resumable model download with an inactivity timeout.
      Wave 2. Worker: `opencode/hy4-flash-free`.
      Files: `tools/fetch-typhoon-model.mjs`, `tools/fetch-typhoon-model.test.mjs` (new, or the existing test location if one exists).
      Red: Test with a local HTTP server that stalls mid-body: the second run resumes from the `.part` size. Test: a bad SHA-256 never publishes. Test: no bytes for the inactivity window aborts, keeps the `.part` file.
      Green: Stream to `<file>.part`, send `Range: bytes=<size>-`, reset the timer per chunk.
      Check: `npx vitest run tools/fetch-typhoon-model.test.mjs` (adjust to the repo's test glob; do not download the real model)
- [ ] **A5** (H08 FR5): Upload extracted audio to the cloud provider, in chunks.
      Wave 2. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/ai/src/openai.ts`, `packages/ai/src/openai.test.ts`, `packages/ai/src/audio-extract.ts` (new, shared with the local providers if they already extract). Depends on A3.
      Red: Test: the request body is an audio file, not the video bytes. Test: media above the size limit splits and the second chunk's words carry the offset. Test: no whole-file `readFile` of the video.
      Green: Reuse the ffmpeg WAV/opus extraction seam. Cut chunks with `-ss`/`-t`. Add offsets when merging.
      Check: `npx vitest run packages/ai`

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
