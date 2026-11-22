# Plan: Save and Export Integrity

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Preserve edits and existing output during concurrent or failed operations.

**Check command:** `npm run check` plus race and offline export tests.
**Dependencies:** `local_safety_20261122`, `edit_timeline_integrity_20261122`.

---

## Phase 1: Revision-aware save coordinator

### Red

- [ ] Add delayed-response tests before changing saved-state acknowledgment.
      Files: `apps/web/hooks/use-transcript-document.test.tsx`,
      `apps/web/hooks/use-auto-save.test.tsx`.
      Cover edit-during-save, undo-during-save, failure, and project switch.
- [ ] Add failing save/navigation integration tests.
      File: `apps/web/hooks/use-project-session.test.tsx` (new).
      Cover explicit Save during autosave and flush failure before navigation.

**Targeted Red command:** `npx vitest run apps/web/hooks/use-transcript-document.test.tsx apps/web/hooks/use-auto-save.test.tsx apps/web/hooks/use-project-session.test.tsx`.

### Green

- [ ] Define save identity and acknowledgment contracts before implementing the coordinator.
      Files: `apps/web/hooks/use-transcript-document.ts`,
      `apps/web/hooks/use-project-session.ts` (new).
      Keep persistence decisions in a testable coordinator, not the page.
- [ ] Implement revision-aware acknowledgment and shared single-flight saves.
      Files: the session hook, `apps/web/hooks/use-auto-save.ts`,
      `apps/web/server/project-api.ts`, `apps/web/pages/api/transcript.ts`.
- [ ] Wire navigation, retry, and close protection.
      File: `apps/web/pages/index.tsx`.
      Prevent old requests from changing the current project's state.

### Verification

- [ ] Run all delayed-response tests with deterministic promises.
- [ ] Run `npm run check`; record dirty-state and navigation outcomes.
- [ ] Commit the phase and its save contract.

---

## Phase 2: Isolated work and safe publication

### Red

- [ ] Add failing concurrent-export tests with different scenes and delayed runners.
      Files: `apps/web/server/storyboard-api.test.ts`,
      `apps/web/server/storyboard-export.test.ts`.
      Assert each job uses unique segment and concat paths.
- [ ] Add failing no-clobber and source-alias tests.
      Files: `packages/media/src/export.test.ts`,
      `packages/core/src/output-publication.test.ts` (new).
      Use real temporary symlinks, hard links, and sentinel output.
- [ ] Add failing provenance-publication tests.
      File: `apps/web/server/storyboard-export.test.ts`.
      Inject verification, rename, and provenance failures separately.

**Targeted Red command:** `npx vitest run apps/web/server/storyboard-api.test.ts apps/web/server/storyboard-export.test.ts packages/media/src/export.test.ts packages/core/src/output-publication.test.ts`.

### Green

- [ ] Define destination consent and publication interfaces first.
      Files: `packages/core/src/output-publication.ts` (new),
      `apps/web/server/storyboard-export.ts`, `packages/media/src/export.ts`.
- [ ] Allocate job directories and write only temporary output before verification.
      Files: `apps/web/server/storyboard-api.ts`, `packages/compose/src/render-step.ts`,
      `packages/compose/src/assemble.ts`.
- [ ] Publish verified output and provenance; preserve old output on every failure path.
      Files: the publication adapter, `apps/web/server/storyboard-export.ts`,
      `apps/web/pages/api/export.ts`.
- [ ] Wire explicit replacement consent and operation state.
      File: `apps/web/pages/index.tsx`.
      Keep the API safe even when two requests bypass the UI.

### Verification

- [ ] Run race, alias, publication, and failure-injection tests.
- [ ] Run one real failed export and verify the previous file's hash.
- [ ] Run `npm run check`; commit the phase with preservation evidence.

---

## Phase 3: Measured export reuse

### Red

- [ ] Add failing cache-key tests for source, edit, template, codec, geometry, and audio changes.
      Files: `packages/compose/src/segment-cache.test.ts` (new),
      `packages/compose/src/render-step.test.ts`.
- [ ] Add failing fast-path eligibility tests before changing export planning.
      File: `packages/media/src/export-plan.test.ts` (new).
      Include codec and container mismatch, edits, missing streams, and exact full-source reuse.
- [ ] Add a real repeat-export fixture that counts encodes and compares measured media.
      File: `packages/compose/src/render-step.integration.test.ts`.

**Targeted Red command:** `npx vitest run packages/compose/src/segment-cache.test.ts packages/media/src/export-plan.test.ts packages/compose/src/render-step.test.ts`.

### Green

- [ ] Define cache identity and reuse eligibility as pure functions.
      Files: `packages/compose/src/segment-cache.ts` (new),
      `packages/media/src/export-plan.ts` (new).
- [ ] Reuse verified segments and eligible full-source output through existing adapters.
      Files: `packages/compose/src/render-step.ts`, `packages/media/src/export.ts`,
      `apps/web/server/storyboard-api.ts`.
- [ ] Report reused and encoded work through the existing job progress contract.
      Files: `apps/web/server/storyboard-export.ts`, `apps/web/server/export-job.ts`.

### Verification

- [ ] Record cold and warm timings on the same local fixture through the heavy runner.
- [ ] Prove the second identical export performs zero segment encodes.
- [ ] Prove changed scenes and unsupported copy cases take the correct fallback.
- [ ] Run `npm run check` and `npm run e2e`; inspect the final output measurements.
- [ ] Obtain independent data-integrity review before acceptance.
- [ ] Commit evidence; update the registry and metadata after acceptance.
