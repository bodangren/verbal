# Plan: Edit Timeline Integrity

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Make transcript edits describe the media that plays and exports.

**Check command:** `npm run check` plus measured offline media fixtures.
**Dependencies:** `local_safety_20261122`.

---

## Phase 1: Versioned edit contract

### Red

- [ ] Add failing timeline tests for middle deletion, backward reorder, silence, split, and undo.
      Files: `packages/core/src/edit-timeline.test.ts` (new),
      `packages/core/src/transcript.test.ts`, `packages/core/src/sync.test.ts`.
      Assert source timestamps never change.
- [ ] Add failing compatibility tests for old projects, unknown versions, and ambiguous shifted timestamps.
      Files: `packages/core/src/edit-document.test.ts` (new), `packages/core/src/project.test.ts`.

**Targeted Red command:** `npx vitest run packages/core/src/edit-timeline.test.ts packages/core/src/edit-document.test.ts packages/core/src/transcript.test.ts packages/core/src/sync.test.ts`.

### Green

- [ ] Define the versioned edit schema and source/output timeline interfaces first.
      Files: `packages/core/src/edit-document.ts` (new),
      `packages/core/src/edit-timeline.ts` (new), `packages/core/src/browser.ts`.
- [ ] Implement the pure compiler, migrations, and separate time lookups.
      Files: the new edit modules, `packages/core/src/transcript.ts`, `packages/core/src/sync.ts`,
      `packages/media/src/cutlist.ts`, `packages/cleanup/src/freeze.ts`.
- [ ] Update the editing hook without moving timeline business logic into React.
      Files: `apps/web/hooks/use-transcript-document.ts`, its tests,
      `apps/web/server/freeze-api.ts`.

### Verification

- [ ] Run the targeted tests and compare old-project fixture output.
- [ ] Run `npm run check`; record migration decisions and coverage for new modules.
- [ ] Commit the phase and attach the contract evidence.

---

## Phase 2: One compiler for scenes and playback

### Red

- [ ] Add failing tests for interior deletions and slide offsets after source time zero.
      Files: `packages/storyboard/src/anchors.test.ts`,
      `packages/storyboard/src/from-transcript.test.ts`,
      `packages/compose/src/render-step.test.ts`, `apps/web/server/storyboard-api.test.ts`.
- [ ] Add a failing visual-kind and layer matrix.
      Files: `packages/compose/src/scene-plan.test.ts` (new), `packages/compose/src/preview.test.ts`.
      Include missing assets, all removed words, and reordered spans.
- [ ] Add failing playback tests for reordered source pieces and generated silence.
      Files: `apps/web/hooks/use-playback-sync.test.tsx`,
      `apps/web/components/playback-screen.test.tsx`.

**Targeted Red command:** `npx vitest run packages/storyboard/src packages/compose/src/render-step.test.ts packages/compose/src/scene-plan.test.ts packages/compose/src/preview.test.ts apps/web/server/storyboard-api.test.ts apps/web/hooks/use-playback-sync.test.tsx apps/web/components/playback-screen.test.tsx`.

### Green

- [ ] Define scene-plan inputs and outputs before adapting callers.
      Files: `packages/compose/src/scene-plan.ts` (new), `packages/compose/src/assemble.ts`,
      `packages/compose/src/render-step.ts`, `packages/compose/src/composite.ts`.
- [ ] Carry source pieces, offsets, layers, and assets through the compiler.
      Files: `packages/storyboard/src/anchors.ts`, `packages/compose/src/preview.ts`,
      `apps/web/server/storyboard-api.ts`, `apps/web/pages/api/export.ts`.
      Move cut-export business logic into a server service.
- [ ] Wire edited playback and freeze to the same timeline.
      Files: `apps/web/hooks/use-playback-sync.ts`, `apps/web/components/PlaybackScreen.tsx`,
      `apps/web/pages/index.tsx`, `apps/web/server/freeze-api.ts`.

### Verification

- [ ] Run the visual matrix and playback tests.
- [ ] Run `npm run check`; inspect every caller of changed timeline exports.
- [ ] Commit the phase and record shared-plan equivalence.

---

## Phase 3: Stream normalization and measured exports

### Red

- [ ] Add failing real-media tests with distinct tones and colored source intervals.
      Files: `packages/compose/src/render-step.integration.test.ts`,
      `packages/media/src/export.integration.test.ts`.
      Assert deletion, reordered content, inserted silence, and a later slide offset.
- [ ] Add failing mixed-stream tests for silent, mono, and stereo source media.
      Files: `packages/compose/src/composite.integration.test.ts`,
      `packages/compose/src/video-range.test.ts`.
      Probe every segment before concat.

**Targeted Red command:** `npx vitest run packages/compose/src/render-step.integration.test.ts packages/compose/src/composite.integration.test.ts packages/media/src/export.integration.test.ts packages/compose/src/video-range.test.ts`.

### Green

- [ ] Extend the normalized segment contract before changing builders.
      Files: `packages/compose/src/composite.ts`, `packages/compose/src/video-range.ts`,
      `packages/media/src/export.ts`.
- [ ] Implement silent-audio synthesis and consistent stream parameters.
      Files: the segment builders and `apps/web/server/storyboard-api.ts`.
- [ ] Update the offline browser fixture to export an actual edited project.
      File: `tools/e2e/walkthrough.mjs`.
      Use fake ASR and local media only.

### Verification

- [ ] Run the measured fixtures through the shared heavy runner.
- [ ] Run the real renderer tests with `VERBAL_REMOTION_TEST=1` after its documented local bootstrap.
- [ ] Run `npm run check` and `npm run e2e`; record codec, channel, duration, and content measurements.
- [ ] Obtain independent correctness review before acceptance.
- [ ] Commit evidence; update metadata and the registry only after acceptance.
