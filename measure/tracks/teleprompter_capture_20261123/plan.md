# Plan: Webcam Recording with Teleprompter

**Status:** COMPLETE — Phases 1–5
**Created:** 2026-11-23
**Focus:** Record a take from the browser stream with a top-center prompter, align each take to the script, and reread only the bungled beats.

**Check command:** `npm run check`, `npm run e2e`, and `node tools/e2e/ux-gates.mjs`.
**Dependencies:** `ux_shell_flow_20261122` (complete), `local_safety_20261122` (upload validation), `edit_timeline_integrity_20261122` (cut fidelity), `packages/ai`.

---

## Phase 1: Script and prompter

### Red

- [x] Add failing pure tests for beats and the prompter clock.
      Files: `packages/takes/src/beats.test.ts` (new), `apps/web/components/prompter-clock.test.ts` (new).
      Cover sentence/line splitting, stable ids, word count, read time at 150 WPM, offset over time, speed changes, reset, and reduced motion.
- [x] Add failing component tests for the prompter overlay.
      File: `apps/web/components/teleprompter.test.tsx` (new).
      Cover the top-center overlay, play/pause, speed, font size, mirror, reset, `aria-hidden`, and scoped keys.
- [x] Add failing server tests for the script store.
      File: `apps/web/server/script-api.test.ts` (new).
      Cover GET of a missing file (empty), PUT validation, atomic write, and project-root containment.

**Targeted Red command:** `npx vitest run packages/takes/src/beats.test.ts apps/web/components/prompter-clock.test.ts apps/web/components/teleprompter.test.tsx apps/web/server/script-api.test.ts`.

### Green

- [x] Add `packages/takes` for beats and the script document.
      Files: `packages/takes/package.json`, `packages/takes/src/index.ts`, `beats.ts`, `script.ts`.
- [x] Add the script API and its store.
      Files: `apps/web/server/script-api.ts` (new), `apps/web/pages/api/script.ts` (new).
- [x] Build the full-screen Studio overlay (camera, prompter, script drawer) and a persistent Script card in Ingest. The inline Studio was rejected: it competed with the preview and forced scrolling.
      Files: `apps/web/components/Teleprompter.tsx` (new), `apps/web/components/StudioOverlay.tsx` (new), `apps/web/pages/index.tsx`, `apps/web/styles/globals.css`.

### Verification

- [x] Run the targeted tests and the gate (no new page scroll or live regions). Verify the overlay at 1440x900: full viewport, page scroll 0/0, prompter over the camera.
- [x] Commit the phase.

---

## Phase 2: Browser capture and normalization

### Red

- [x] Add failing tests for the recorder wrapper.
      File: `apps/web/lib/capture-recorder.test.ts` (new).
      Cover MIME negotiation (VP9, VP8, MP4), chunk assembly, stop, and the unsupported case.
- [x] Add failing tests for the take store.
      File: `apps/web/server/take-store.test.ts` (new).
      Cover manifest read/write, timestamp naming, atomic write, delete, and the byte cap.
- [x] Add failing tests for the normalize job.
      File: `apps/web/server/normalize-job.test.ts` (new).
      Use a fake spawner: success, failure, progress, and output path.
- [x] Add failing component tests for the Studio capture controls.
      File: `apps/web/components/studio-overlay.test.tsx` (new).
      Cover the countdown, record/stop, device selection, elapsed time, and the unload guard.

**Targeted Red command:** `npx vitest run apps/web/lib/capture-recorder.test.ts apps/web/server/take-store.test.ts apps/web/server/normalize-job.test.ts apps/web/components/studio-overlay.test.tsx`.

### Green

- [x] Implement the recorder wrapper and negotiation.
      File: `apps/web/lib/capture-recorder.ts` (new).
- [x] Implement the take store and normalize job.
      Files: `apps/web/server/take-store.ts` (new), `apps/web/server/normalize-job.ts` (new), `apps/web/pages/api/takes.ts` (new).
- [x] Wire capture into the Studio and Ingest.
      Files: `apps/web/components/StudioStage.tsx`, `apps/web/pages/index.tsx`, `apps/web/styles/globals.css`.

### Verification

- [x] Run the targeted tests and an e2e smoke with Chrome's fake media device.
- [x] Commit the phase.

---

## Phase 3: Take transcription and alignment

### Red

- [x] Add failing pure tests for script alignment.
      File: `packages/takes/src/align.test.ts` (new).
      Cover normalization, Needleman-Wunsch, per-beat coverage, source ranges, confidence, skipped and improvised beats.
- [x] Add failing server tests for take transcription.
      File: `apps/web/server/take-transcript.test.ts` (new).
      Cover provider injection, word timestamps, storage, and local versus cloud selection.
- [x] Add failing component tests for the take review.
      File: `apps/web/components/take-review.test.tsx` (new).
      Cover status chips, seek to a beat, manual override, and no LLM call.

**Targeted Red command:** `npx vitest run packages/takes/src/align.test.ts apps/web/server/take-transcript.test.ts apps/web/components/take-review.test.tsx`.

### Green

- [x] Implement alignment and per-beat status.
      File: `packages/takes/src/align.ts` (new).
- [x] Implement take transcription and its API.
      Files: `apps/web/server/take-transcript.ts` (new), `apps/web/pages/api/take-transcript.ts` (new).
- [x] Build the take review surface.
      Files: `apps/web/components/TakeReview.tsx` (new), `apps/web/pages/index.tsx`, `apps/web/styles/globals.css`.

### Verification

- [x] Run the targeted tests against fixture transcribes.
- [x] Commit the phase.

---

## Phase 4: LLM review, reread, and EDL

### Red

- [x] Add failing tests for the review schema.
      File: `packages/takes/src/review.test.ts` (new).
      Cover JSON parsing, unknown beat ids, invalid actions, out-of-range sources, overlap, and the keep fallback.
- [x] Add failing tests for the EDL.
      File: `packages/takes/src/edl.test.ts` (new).
      Cover ordered ranges, 100 ms handles, transcript shifting, and empty selections.
- [x] Add failing server tests for the review API.
      File: `apps/web/server/take-review-api.test.ts` (new).
      Cover provider injection, the opt-in gate, the cost estimate, and no call without opt-in.
- [x] Add failing tests for the reread flow.
      Files: `apps/web/components/studio-stage.test.tsx`, `apps/web/components/take-review.test.tsx`.
      Cover positioning at the first marked beat, dimmed good beats, and replacing a beat's source.

**Targeted Red command:** `npx vitest run packages/takes/src/review.test.ts packages/takes/src/edl.test.ts apps/web/server/take-review-api.test.ts apps/web/components/studio-stage.test.tsx apps/web/components/take-review.test.tsx`.

### Green

- [x] Implement the review schema and EDL builders.
      Files: `packages/takes/src/review.ts` (new), `packages/takes/src/edl.ts` (new).
- [x] Implement the review API and the reread wiring.
      Files: `apps/web/server/take-review-api.ts` (new), `apps/web/pages/api/take-review.ts` (new), `apps/web/components/StudioStage.tsx`, `apps/web/pages/index.tsx`.
- [x] Implement the EDL and Build Cut (kept ranges, handles, duration). Rendering the EDL to a file is the export step left for Phase 5.
      Files: `apps/web/server/assembly.ts` (new), `apps/web/pages/api/assembly.ts` (new), `packages/compose/src/export.ts`, `apps/web/pages/index.tsx`.

### Verification

- [x] Run the targeted tests and an e2e fixture with a bungled beat and a reread.
- [x] Commit the phase.

---

## Phase 5: Errors, e2e, and gate

### Verification

- [x] Add e2e with `--use-fake-device-for-media-stream`: the script persists, a take records and stops, the take appears, a bungled beat is marked, a reread replaces it, and the EDL previews.
- [x] Add the error paths: permission denied, no device, upload failed, normalize failed, STT failed, LLM failed. Route each to the Ingest pane with Retry and Dismiss.
- [x] Extend the UX gate: Studio opens with one click from Ingest; zero page scroll at 1440x900, 1280x800, and 1024x700; one live region; the prompter is `aria-hidden`.
- [x] Update `tech-stack.md` (MediaRecorder and `packages/takes`), `measure/tracks.md`, and the metadata after acceptance.
- [x] Run `npm run check`, `npm run e2e`, and the gate; the fake-media e2e records a take. A real-camera, deliberately flubbed-take pass was not performed on this machine.
