# Plan: Deliver Strip and Export Panel

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** A visible storyboard and an export panel with honest states.

**Check command:** `npm run check`, `npm run e2e`, and `node tools/e2e/ux-gates.mjs`.
**Dependencies:** `job_lifecycle_20261122`, `save_export_integrity_20261122`, `ux_shell_flow_20261122`.

---

## Phase 1: Storyboard strip and selection

### Red

- [ ] Add failing pure tests for the card model: kind, label, duration, brand ends, and missing assets.
      File: `apps/web/components/storyboard-cards.test.ts` (new).
- [ ] Add failing component tests for the listbox, arrow keys, and the selected border.
      File: `apps/web/components/storyboard-strip.test.tsx` (new).
- [ ] Add failing service tests for the cached thumbnail endpoint, with an injected runner.
      File: `apps/web/server/thumbnail-api.test.ts` (new).
      Assert that the path adapter runs before FFmpeg.

**Targeted Red command:** `npx vitest run apps/web/components/storyboard-cards.test.ts apps/web/components/storyboard-strip.test.tsx apps/web/server/thumbnail-api.test.ts`.

### Green

- [ ] Implement the card model and the strip.
      Files: `apps/web/components/storyboard-cards.ts` (new), `apps/web/components/StoryboardStrip.tsx` (new).
- [ ] Add the thumbnail service and route.
      Files: `apps/web/server/thumbnail-api.ts` (new), `apps/web/pages/api/media/thumbnail.ts` (new), `packages/media/src/thumbnail.ts` (new).
- [ ] Show the selected scene in the inspector. Keep the field editor slot empty.
      Files: `apps/web/components/SceneSummary.tsx` (new), `apps/web/pages/index.tsx`.

### Verification

- [ ] Run the targeted tests.
- [ ] Commit the phase.

---

## Phase 2: Export panel states

### Red

- [ ] Add failing component tests for ready, running, done, failed, cancelled, and the Replace confirm.
      File: `apps/web/components/export-panel.test.tsx` (new).
      Drive the states with injected job events.
      Include a transcription job that must not show, and a failed job that must reach the status bar.
- [ ] Add failing tests for the defaults: Title from the project, Contact from storage.
      File: `apps/web/lib/export-defaults.test.ts` (new).
- [ ] Add failing e2e steps: progress rises, Cancel, unwritable path, Replace confirm.
      File: `tools/e2e/walkthrough.mjs`.

**Targeted Red command:** `npx vitest run apps/web/components/export-panel.test.tsx apps/web/lib/export-defaults.test.ts`.

### Green

- [ ] Build the export panel on the job events from `job_lifecycle_20261122`.
      Files: `apps/web/components/ExportPanel.tsx` (new), `apps/web/pages/index.tsx`.
- [ ] Add the folder picker mode for the output file.
      File: `apps/web/components/MediaPicker.tsx`.
- [ ] Add the defaults.
      File: `apps/web/lib/export-defaults.ts` (new).

### Verification

- [ ] Run the targeted tests and the walkthrough.
- [ ] Commit the phase.

---

## Phase 3: Advanced drawer

### Red

- [ ] Add failing tests: the drawer is closed by default, remembers its state, and keeps estimate-before-generate.
      File: `apps/web/components/advanced-drawer.test.tsx` (new).

**Targeted Red command:** `npx vitest run apps/web/components/advanced-drawer.test.tsx`.

### Green

- [ ] Move the three expert panels into the drawer.
      Files: `apps/web/components/AdvancedDrawer.tsx` (new), `apps/web/pages/index.tsx`.

### Verification

- [ ] Run `npm run check`, `npm run e2e`, and the gate through the heavy runner.
- [ ] Re-capture Deliver at three viewports and compare with `target-deliver.jpg`.
- [ ] Commit evidence; update the registry and metadata after acceptance.
