# Plan: Edited Timeline and Playback

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Show the edit on the timeline and play the edit, not the source.

**Check command:** `npm run check`, `npm run e2e`, and `node tools/e2e/ux-gates.mjs`.
**Dependencies:** `export_fidelity_20261127`, `fe_transcript_20261127`, `ux_edit_inspector_20261122`.

---

## Phase 1: Edit playback

### Red

- [ ] Add failing pure tests for the playback schedule from the compiled timeline.
      File: `apps/web/hooks/edit-playback.test.ts` (new).
      Cover a cut, a reorder, a silence gap, and a seek into a cut.
- [ ] Add failing hook tests with an injected clock for jumps and the Source toggle.
      File: `apps/web/hooks/use-playback-sync.test.tsx`.

**Targeted Red command:** `npx vitest run apps/web/hooks/edit-playback.test.ts apps/web/hooks/use-playback-sync.test.tsx`.

### Green

- [ ] Implement the schedule as a pure function of the compiled timeline.
      File: `apps/web/hooks/edit-playback.ts` (new).
- [ ] Drive the video from the schedule. Add the Edit and Source toggle and the time readout.
      Files: `apps/web/hooks/use-playback-sync.ts`, `apps/web/components/PlaybackScreen.tsx`.

### Verification

- [ ] Run the targeted tests.
- [ ] Commit the phase.

---

## Phase 2: Timeline overlay and zoom

### Red

- [ ] Add failing pure tests for range-to-pixel mapping at each zoom.
      File: `apps/web/components/timeline-geometry.test.ts` (new).
- [ ] Add failing component tests for the overlay, selection markers, and zoom buttons.
      File: `apps/web/components/timeline.test.tsx` (new).

**Targeted Red command:** `npx vitest run apps/web/components/timeline-geometry.test.ts apps/web/components/timeline.test.tsx`.

### Green

- [ ] Build the timeline with the overlay and zoom.
      Files: `apps/web/components/Timeline.tsx` (new), `apps/web/components/timeline-geometry.ts` (new), `apps/web/styles/globals.css`.
- [ ] Replace the waveform image block in the player.
      File: `apps/web/components/PlaybackScreen.tsx`.

### Verification

- [ ] Run the targeted tests.
- [ ] Commit the phase.

---

## Phase 3: Keyboard and drag selection

### Red

- [ ] Add failing component tests for the slider role, the keys, and drag selection.
      File: `apps/web/components/timeline.test.tsx`.
- [ ] Add failing e2e steps: play the edit, play the source, reorder order, silence gap, drag select.
      File: `tools/e2e/walkthrough.mjs`.

**Targeted Red command:** `npx vitest run apps/web/components/timeline.test.tsx`.

### Green

- [ ] Add the keys and the drag selection. Map the span to words.
      Files: `apps/web/components/Timeline.tsx`, `apps/web/pages/index.tsx`.

### Verification

- [ ] Run `npm run check`, `npm run e2e`, and the gate through the heavy runner.
- [ ] Record the measured jump gap and silence length.
- [ ] Commit evidence; update the registry and metadata after acceptance.
