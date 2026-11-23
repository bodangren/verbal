# Plan: Shell and Core Flow

**Status:** IN PROGRESS — Phase 1 complete; Phase 2 next
**Created:** 2026-11-22
**Focus:** One shell for all modes, and a short path from a take to a transcript.

**Check command:** `npm run check`, `npm run e2e`, and `node tools/e2e/ux-gates.mjs`.
**Dependencies:** `ux_gates_20261122`.

---

## Phase 1: Persistent browser, top bar, and Edit layout

### Red

- [x] Add failing tests for the browser in every mode and the current project row.
      Files: `apps/web/components/project-browser.test.tsx` (new), `apps/web/pages/index.test.tsx`.
      Assert `aria-current="true"` on the open row and the collapse state in localStorage.
- [x] Add failing tests for the top bar save dot and the Export button.
      File: `apps/web/components/top-bar.test.tsx` (new).
      Export switches to Deliver and focuses the export panel.
- [x] Add a failing gate check: visible transcript lines at 1440x900 and 1024x700.
      File: `tools/e2e/ux-gates.mjs`.

**Targeted Red command:** `npx vitest run apps/web/components/project-browser.test.tsx apps/web/components/top-bar.test.tsx`.

### Green

- [x] Extract the top bar into a component with the save dot and Export.
      Files: `apps/web/components/TopBar.tsx` (new), `apps/web/pages/index.tsx`.
- [x] Render the browser in all modes with a collapse rail.
      Files: `apps/web/components/ProjectBrowser.tsx`, `apps/web/pages/index.tsx`, `apps/web/styles/globals.css`.
- [x] Add media duration to the browser summary.
      Files: `apps/web/server/fs-api.ts`, its test.
- [x] Lay out the Edit stage as player, timeline, and a scrolling transcript. Add Collapse Player.
      Files: `apps/web/pages/index.tsx`, `apps/web/components/PlaybackScreen.tsx`, `apps/web/styles/globals.css`.

### Verification

- [x] Run the targeted tests and the gate at three viewports.
- [x] Commit the phase.

---

## Phase 2: Ingest stage and inspector

### Red

- [ ] Add failing tests for the import card, the media row states, and Retry.
      File: `apps/web/components/ingest-stage.test.tsx` (new).
      Cover Not Transcribed, Transcribing… 40%, Transcribed 81 words, and Failed.
- [ ] Add failing tests for media details and next steps.
      File: `apps/web/components/ingest-inspector.test.tsx` (new).
      Use an injected probe result. Assert the Open in Edit button.
- [ ] Extend the UX gate: new project to editable transcript in 5 clicks or less. It fails today at 8.

**Targeted Red command:** `npx vitest run apps/web/components/ingest-stage.test.tsx apps/web/components/ingest-inspector.test.tsx`.

### Green

- [ ] Build the Ingest stage and inspector components.
      Files: `apps/web/components/IngestStage.tsx` (new), `apps/web/components/IngestInspector.tsx` (new).
- [ ] Start import when the picker returns a file. Rename the picker action to Import.
      Files: `apps/web/components/MediaPicker.tsx`, `apps/web/pages/index.tsx`.
- [ ] Move batch transcription into a dialog with project checkboxes.
      File: `apps/web/components/BatchDialog.tsx` (new).
- [ ] Show the provider name from `/api/system`.
      Files: `apps/web/server/transcribe-service.ts`, `apps/web/pages/api/system.ts`.

### Verification

- [ ] Run the targeted tests, `npm run e2e`, and the gate.
- [ ] Commit the phase with the measured click count.

---

## Phase 3: Errors and session memory

### Red

- [ ] Add failing tests for the inline alert, Dismiss, and the in-place Transcribe action.
      Files: `apps/web/components/pane-alert.test.tsx` (new), `apps/web/pages/index.test.tsx`.
- [ ] Add failing tests for the session store and the fallback for a missing project.
      File: `apps/web/lib/session.test.ts` (new).
- [ ] Add failing e2e steps: reload in Edit, forced import error, unsaved-edit warning.
      File: `tools/e2e/walkthrough.mjs`.

**Targeted Red command:** `npx vitest run apps/web/components/pane-alert.test.tsx apps/web/lib/session.test.ts`.

### Green

- [ ] Add the pane alert and route `guard` errors to the owning pane.
      Files: `apps/web/components/PaneAlert.tsx` (new), `apps/web/pages/index.tsx`.
- [ ] Persist the project and mode; reopen on load; add `beforeunload`.
      Files: `apps/web/lib/session.ts` (new), `apps/web/pages/index.tsx`.

### Verification

- [ ] Run `npm run check`, `npm run e2e`, and the gate through the heavy runner.
- [ ] Re-capture Ingest at three viewports and compare with `target-ingest.jpg`.
- [ ] Commit evidence; update the registry and metadata after acceptance.
