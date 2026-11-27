# Plan: Deliver Preview and Scene Controls

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Play the composed edit before export and expose existing scene fields.

**Check command:** `npm run check`, `npm run e2e`, and real local preview measurements.
**Dependencies:** `export_fidelity_20261127`, `export_safety_20261127`, `job_integrity_20261127`.

---

## Phase 1: Preview execution contract

### Red

- [ ] Add failing tests that distinguish planned, rendering, ready, stale, and failed states.
      Files: `packages/compose/src/preview.test.ts`, `apps/web/server/storyboard-api.test.ts`.
- [ ] Add failing tests for full-preview jobs, cancellation, and revision fencing.
      File: `apps/web/server/preview-job.test.ts` (new).
      Prove fast preview never invokes a renderer.
- [ ] Add a failing component test requiring playable media for a ready preview.
      File: `apps/web/components/storyboard-preview.test.tsx`.

**Targeted Red command:** `npx vitest run packages/compose/src/preview.test.ts apps/web/server/storyboard-api.test.ts apps/web/server/preview-job.test.ts apps/web/components/storyboard-preview.test.tsx`.

### Green

- [ ] Define preview job and media-result schemas before changing endpoints.
      Files: `packages/compose/src/preview.ts`, `apps/web/server/preview-job.ts` (new).
- [ ] Wire the existing executor and shared assembler into preview jobs.
      Files: the preview service, `apps/web/server/storyboard-api.ts`,
      `apps/web/pages/api/storyboard/preview.ts`.
- [ ] Serve verified preview output through a validated project-media endpoint.
      Files: `apps/web/server/media-file.ts`, the relevant media route.
- [ ] Render a player and honest state labels using the job-event hook.
      Files: `apps/web/components/StoryboardPreview.tsx`, `apps/web/pages/index.tsx`.
      Keep preview decisions in the service and session coordinator.

### Verification

- [ ] Run the targeted tests and compare preview and export scene plans.
- [ ] Run `npm run check`; commit the phase with state-transition evidence.

---

## Phase 2: Existing scene fields

### Red

- [ ] Add failing inspector tests for selection, layers, template fields, and validation errors.
      File: `apps/web/components/scene-inspector.test.tsx` (new).
- [ ] Add failing persistence tests for valid changes and rejected invalid documents.
      Files: `apps/web/server/storyboard-api.test.ts`, `packages/storyboard/src/patches.test.ts`.
- [ ] Add failing tests for empty-storyboard export controls and missing assets.
      Files: the inspector tests and `apps/web/components/storyboard-preview.test.tsx`.

**Targeted Red command:** `npx vitest run apps/web/components/scene-inspector.test.tsx apps/web/components/storyboard-preview.test.tsx apps/web/server/storyboard-api.test.ts packages/storyboard/src/patches.test.ts`.

### Green

- [ ] Define editable scene fields and validation results outside React.
      Files: `packages/storyboard/src/parse.ts`, `packages/storyboard/src/patches.ts`.
- [ ] Implement the small inspector using existing design tokens.
      Files: `apps/web/components/SceneInspector.tsx` (new), `apps/web/styles/globals.css`.
- [ ] Wire selection and persistence; retain advanced JSON editing.
      Files: `apps/web/pages/index.tsx`, the project session coordinator.
      Invalidate preview state after a successful scene edit.

### Verification

- [ ] Run inspector and persistence tests.
- [ ] Run `npm run check`; inspect keyboard focus and labelled errors.
- [ ] Commit the phase with the existing-field inventory.

---

## Phase 3: Cache identity and hold tail

### Red

- [ ] Add failing hash tests for template-source changes and hold-tail extensions.
      Files: `packages/compose/src/slides.test.ts`, `packages/compose/src/cache.test.ts`.
- [ ] Add failing single-flight and cancelled-cache tests.
      Files: the cache tests and `packages/compose/src/worker.test.ts`.
- [ ] Add a real animation fixture that compares its last motion frame and extended hold.
      File: `packages/compose/src/remotion.integration.test.ts`.

**Targeted Red command:** `npx vitest run packages/compose/src/slides.test.ts packages/compose/src/cache.test.ts packages/compose/src/worker.test.ts`.

### Green

- [ ] Define template version and natural-duration contracts first.
      Files: `packages/compose/src/types.ts`, `packages/compose/src/slides.ts`,
      `tools/remotion/render.mjs`.
- [ ] Implement atomic cache publication and per-key single-flight.
      Files: `packages/compose/src/cache.ts`, `packages/compose/src/slides.ts`.
- [ ] Add hold-tail composition through the existing FFmpeg builder.
      Files: `packages/compose/src/composite.ts`, `packages/compose/src/render-step.ts`,
      `tools/remotion/src/**`.
      Include the template version in segment-cache identity.

### Verification

- [ ] Record cold, warm, and anchor-only preview timings through the heavy runner.
- [ ] Verify an anchor-only hold extension performs zero new Remotion frame renders.
- [ ] Run real renderer tests and inspect output timing and frozen-tail frames.
- [ ] Run `npm run check` and `npm run e2e`.
- [ ] Inspect both supported desktop viewports for clipping and focus order.
- [ ] Obtain independent browser review before acceptance.
- [ ] Commit evidence; update the registry and metadata after acceptance.
