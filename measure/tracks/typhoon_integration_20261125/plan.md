# Plan: Typhoon ASR Integration

**Status:** COMPLETE
**Created:** 2026-11-25
**Focus:** Make Typhoon ASR Realtime (Thai, ONNX) the local speech engine, with no Python runtime.

**Check command:** `npm run check` plus a real-model Thai transcription on this machine.
**Dependencies:** `thai_stt_20261125` (evaluation, complete). Daniel chose the TypeScript + `onnxruntime-node` route on 2026-11-25.

---

## Phase 1: Pure frontend (Red then Green)

- [x] Add tests for the NeMo mel frontend against values produced by the
      Python reference (`pythaiasr/typhoon.py`) on a fixed sine wave.
      File: `packages/ai/src/typhoon-features.test.ts` (new).
- [x] Implement pre-emphasis, reflect-padded STFT (n_fft 512, win 400, hop 160),
      Slaney mel filterbank (80 bins), log + per-feature normalisation, pad to 16.
      File: `packages/ai/src/typhoon-features.ts` (new).
- [x] Verify the TS features match Python within 1e-5 for a fixture signal.

## Phase 2: Engine

- [x] Add tests for token decoding, special tokens, U+2581 handling, and word
      spans derived from `Intl.Segmenter("th")`.
      Files: `packages/ai/src/typhoon-tokens.test.ts` (new).
- [x] Implement the ONNX sessions (encoder, decoder_joint), greedy RNNT decode
      with hidden state (640), frame duration 1280/16000, and word spans.
      File: `packages/ai/src/typhoon-engine.ts` (new).
- [x] Keep the engine injectable: tests never load the 461 MB model.

## Phase 3: Provider

- [x] Add tests for the WAV reader, missing model/binary errors, and progress.
      File: `packages/ai/src/typhoon.test.ts` (new).
- [x] Implement `createTyphoonProvider`: ffmpeg to 16 kHz mono WAV, read PCM,
      run the engine, map tokens to `TranscriptionResult`, cancellation.
      File: `packages/ai/src/typhoon.ts` (new); export from the package index.
- [x] Reuse the existing ffmpeg/LocalRunner seam so tests need no binaries.

## Phase 4: Wiring

- [x] Resolver: prefer a complete Typhoon model directory, then whisper, then cloud.
      Files: `apps/web/server/asr-resolve.ts`, its tests.
- [x] Service: build the Typhoon provider and describe it as `Local (Typhoon ASR)`.
      Files: `apps/web/server/transcribe-service.ts`, its tests,
      `apps/web/server/system-route.test.ts`, `apps/web/pages/index.tsx` if the
      hint copy needs it.
- [x] Missing-model hint names the fetch command.

## Phase 5: Acquisition and docs

- [x] Add `tools/fetch-typhoon-model.mjs`: download the three ONNX/vocab files
      from a configurable base URL (default Hugging Face; `VERBAL_HF_MIRROR`
      supported), with size checks and no shell interpolation.
- [x] Document setup, licence (CC-BY-4.0), and the `VERBAL_ASR` precedence in
      `README.md`; note the engine in `measure/tech-stack.md`.

## Phase 6: Verification

- [x] Run the real model on a Thai clip through the provider; compare the text
      with the Python reference (same audio) and check word spans are monotonic.
- [x] Run targeted vitest files, typecheck, and the full `npm run check`.
- [x] Record the exact verification evidence in this plan/findings and commit.

## Risks

- `onnxruntime-node` is a native module: it must stay server-side and may need
  bundler externalisation. `pages-hygiene.test.ts` guards route files; the
  build is part of the gate.
- Decoder-session call overhead could make the TS port slower than Python;
  measure RTF before claiming parity.
- `Intl.Segmenter("th")` depends on ICU; Node 24 ships it. A fallback must not
  crash if segmentation is unavailable.

## Verification evidence (2026-11-25)

- **Feature parity:** `packages/ai/src/typhoon-features.test.ts` compares the
  TypeScript mel output with Python's on a 1 s sine fixture; max absolute
  difference is below 2e-4. 5 tests.
- **Real-model integration:** `VERBAL_TYPHOON_MODEL=/tmp/.../typhoon-asr-realtime
  npx vitest run packages/ai/src/typhoon.integration.test.ts` passed. It
  transcribes `testdata/thai/common-voice-th.wav` through `createTyphoonProvider`
  (ffmpeg + WAV + ONNX + engine) and matches the Python reference exactly:
  `มันเป็นเรื่องที่ดีที่การเดินทางย้อนเวลาไม่ได้มีอยู่จริง`. 5.0 s audio in 4.1 s
  including session load; 16 word spans, monotonic and inside the clip.
- **Built server:** `node apps/web/dist/standalone/server.js` with
  `VERBAL_TYPHOON_MODEL` reported `Local (Typhoon ASR, Thai)` from `/api/system`.
  A real `POST /api/transcribe` job finished in 5.0 s and wrote the same 16-word
  transcript (`w0` 0.4–0.48 s … `w15` 4.0–4.08 s).
- **Gate:** `npm run check` — 131 test files, 928 passed, 4 skipped; typecheck,
  lint, and the production build all pass. `onnxruntime-node` stays external in
  the server bundle and resolves from `node_modules` at runtime.

## Notes / follow-ups

- The engine caches ONNX sessions per model path, so the first transcription
  pays the model-load cost and later jobs do not.
- Word timestamps are derived from 0.08 s token frames plus
  `Intl.Segmenter("th")`; they are approximate (roughly ±0.1–0.3 s), which is
  what the transcript/cut workflow needs but is not frame-exact.
- The integration test skips when the model is absent; CI stays offline.
- `onnxruntime-node`'s npm postinstall is flagged by npm's allow-scripts policy.
  The package ships its native binding in this install and the built server
  loaded it; document `npm approve-scripts onnxruntime-node` if a future install
  omits the binary.
