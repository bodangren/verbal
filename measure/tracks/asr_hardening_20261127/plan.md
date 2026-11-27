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

- [x] **A1** (H02 FR1): Keep Thai letters in cleanup normalisation. a83289c
      Evidence: 14 cleanup tests green; Red showed one false stutter over five Thai words.
      Wave 1. Worker: `opencode-go/hy4-flash-free`.
      Files: `packages/cleanup/src/detect.ts`, `packages/cleanup/src/detect.test.ts`.
      Red: Test: five different Thai words give zero stutter proposals. Test: the same Thai word twice gives one stutter proposal. Test: punctuation-only tokens never match each other. Test: English `Um,` and `umm` still match.
      Green: Use `/[^\p{L}\p{M}\p{N}]/gu`. Skip empty `norm` in the stutter and repetition passes.
      Check: `npx vitest run packages/cleanup`
- [x] **A2** (M06 FR2): Pick the engine from the requested language. bf46ba7
      Evidence: 21 resolver tests green. Note: `VERBAL_ASR_LANGUAGE=auto` now picks whisper, not Typhoon.
      Wave 1. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/server/asr-resolve.ts`, `apps/web/server/asr-resolve.test.ts`.
      Red: Test: Typhoon installed, `VERBAL_ASR_LANGUAGE=en`, whisper available -> whisper. Test: language unset -> typhoon. Test: `th` -> typhoon. Test: `en` and no whisper -> clear `none` state, not a silent Thai run.
      Green: Move the language read above the Typhoon branch.
      Check: `npx vitest run apps/web/server/asr-resolve.test.ts`
- [x] **A3** (M05 FR3): Private scratch directory for each local ASR call. 35921b7
      Evidence: 86 `packages/ai` tests green; Red showed a shared directory beside the source for both providers.
      Wave 1. Worker: `opencode-go/mimo-v2.6-flash`.
      Files: `packages/ai/src/local.ts`, `packages/ai/src/local.test.ts`, `packages/ai/src/typhoon.ts`, `packages/ai/src/typhoon.test.ts`.
      Red: Test: two concurrent calls write to different directories. Test: the directory is removed after success, failure and abort. Test: a read-only source folder works.
      Green: `mkdtemp` per call, `rm(recursive)` in `finally`. Keep the argv builders pure.
      Check: `npx vitest run packages/ai`
- [x] **A4** (M07 FR4): Resumable model download with an inactivity timeout. 5fb96b3
      Evidence: 5 local-server tests green (resume, bad hash, inactivity). Not run against the live mirror. `vitest.config.ts` gained the `tools/**/*.test.mjs` glob.
      Wave 2. Worker: `opencode-go/hy4-flash-free`.
      Files: `tools/fetch-typhoon-model.mjs`, `tools/fetch-typhoon-model.test.mjs` (new, or the existing test location if one exists).
      Red: Test with a local HTTP server that stalls mid-body: the second run resumes from the `.part` size. Test: a bad SHA-256 never publishes. Test: no bytes for the inactivity window aborts, keeps the `.part` file.
      Green: Stream to `<file>.part`, send `Range: bytes=<size>-`, reset the timer per chunk.
      Check: `npx vitest run tools/fetch-typhoon-model.test.mjs` (adjust to the repo's test glob; do not download the real model)
- [x] **A5** (H08 FR5): Upload extracted audio to the cloud provider, in chunks. 82bd018
      Evidence: 103 `packages/ai` tests green; Red showed the video path read in full. MP3 mono 16 kHz 32 kbps; `libmp3lame` is in the installed ffmpeg. Gap: chunk length is estimated from bytes and bitrate, not ffprobe; no real endpoint call.
      Wave 2. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/ai/src/openai.ts`, `packages/ai/src/openai.test.ts`, `packages/ai/src/audio-extract.ts` (new, shared with the local providers if they already extract). Depends on A3.
      Red: Test: the request body is an audio file, not the video bytes. Test: media above the size limit splits and the second chunk's words carry the offset. Test: no whole-file `readFile` of the video.
      Green: Reuse the ffmpeg WAV/opus extraction seam. Cut chunks with `-ss`/`-t`. Add offsets when merging.
      Check: `npx vitest run packages/ai`

## Phase R2: Acceptance fixes (Sol review, 2026-11-27)

The independent acceptance review rejected or conditionally accepted this track. Each task below reopens a finding it verified. Same worker rules as Phase 1.

- [x] **A5b** (H08 (Sol: verified gap)): Measure chunk duration with ffprobe and enforce the upload limit on each chunk. a0aff44
      Evidence: 140 `packages/ai` tests green; Red showed 13 failures (duration-based plan, per-chunk stat, separate directories). Gap: the single-segment over-limit re-split branch is not unit-tested.
      wave 1. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/ai/src/audio-extract.ts`, `packages/ai/src/openai.ts`, tests.
      Red: Test: chunk boundaries use the probed duration; a chunk above the limit is split again; the extracted audio path and chunk paths cannot collide for a media file named `chunk-0.mp4`.
      Green: Probe the audio, plan chunks from the duration, stat every chunk, use separate subdirectories.
- [x] **A2b** (M06 (Sol: verified)): Send the requested language to the cloud engine. 5250483
      Evidence: 60 tests green; Red showed cloud resolutions with no language and no `language=en` in the multipart body. Gap: a cloud provider built outside `transcribe-service` does not read the environment.
      wave 1. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/server/asr-resolve.ts`, `apps/web/server/transcribe-service.ts`, tests.
      Red: Test: with `VERBAL_ASR_LANGUAGE=en` and the cloud engine (explicit or fallback) the request carries `language=en`.
      Green: Carry the language on the resolved engine and into the request.
- [x] **A4b** (M07 (Sol: verified)): Check Content-Range before appending resumed bytes. 4d51f41
      Evidence: 7 download tests green; Red showed wrong bytes appended. The check compares the start only; a wrong end or total is caught by the SHA-256 check.
      wave 1. Worker: `claude-agent/haiku`.
      Files: `tools/fetch-typhoon-model.mjs`, `tools/fetch-typhoon-model.test.mjs`.
      Red: Test: a 206 whose Content-Range start differs from the `.part` size is not appended; the download restarts from zero.
      Green: Parse Content-Range and compare its start with the part size.

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `openai/gpt-6.2-sol`, report-only, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
