# Plan: Export Fidelity (backend review 2026-11-27)

**Status:** NOT STARTED
**Created:** 2026-11-27
**Focus:** Make every export path play what the Edit view shows: reorder, silence, slide offsets, overlaps, audio-only.

**Check command:** targeted `npx vitest run` per task; then `npm run check` and `npm run e2e` through the heavy lock (orchestrator).
**Relation to older tracks:** Replaces and rolls up (the old tracks are archived). Narrows `edit_timeline_integrity_20261122` Phases 2 and 3. Phase 5 of `dogfood_howto_20261121` already fixed the Deliver talk scenes (`computeTalkItems`); this track fixes the paths that still differ.

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

- [~] **E1** (M01 FR3): Merge overlapping unedited words into one range.
      Wave 1. Worker: `opencode/hy4-flash-free`.
      Files: `apps/web/server/talk-ranges.ts`, `apps/web/server/talk-ranges.test.ts`.
      Red: Test: unedited words `0-1` and `0.8-2` give one range `0-2`. Test: the same words with a deletion between them stay split. Test: a reorder across the overlap stays split.
      Green: Merge ranges when the next start is before the previous end and no edit lies between them.
      Check: `npx vitest run apps/web/server/talk-ranges.test.ts`
- [~] **E3** (H03 FR2): Carry the scene start into composites and seek the speaker input.
      Wave 1. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Files: `packages/compose/src/assemble.ts`, `packages/compose/src/render-step.ts`, `packages/compose/src/composite.ts`, tests. Add a measured test in `packages/compose/src/render-step.integration.test.ts` with a scene at 30 s and two tones.
      Red: Unit test: the composite argv holds `-ss <start>` before the speaker `-i`. Integration test (needs ffmpeg, runs through the heavy lock): speech under a slide at 30 s matches the 30 s tone.
      Green: Add `startSeconds` to the scene step. Pass it into `CompositeRequest.speaker`. Emit `-ss` in `buildCompositeArgs`.
      Check: `npx vitest run packages/compose`
- [ ] **E2** (H01 FR1): One ordered timeline for plain export, freeze and Deliver talk scenes.
      Wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/talk-ranges.ts` (move or re-export), `packages/media/src/cutlist.ts`, `apps/web/pages/api/export.ts`, `packages/cleanup/src/freeze.ts`, tests. Depends on S1 and E1.
      Red: Test: plain export of a reordered transcript passes the new order to the runner. Test: inserted silence reaches the plain export. Test: changing only the order changes the freeze fingerprint. Test: equivalence with `computeTalkItems` on the existing fixtures.
      Green: Extract the pure timeline builder. Make `buildCutList` consume it. Keep the old output for transcripts without reorder or silence (snapshot test).
      Check: `npx vitest run packages/media packages/cleanup apps/web/server/talk-ranges.test.ts apps/web/server/export-route.test.ts`
- [ ] **E4** (M02 FR4): Audio-only presets and silent-audio synthesis.
      Wave 3. Worker: `opencode-go/mimo-v2.6-flash`.
      Files: `packages/media/src/presets.ts`, `packages/media/src/export.ts`, `packages/compose/src/composite.ts`, tests. Depends on S1 (same `export.ts`).
      Red: Test: an audio-only preset yields argv with no `-map [vout]` and no `[0:v]`. Test: a source without audio and a recipe that needs audio gets `anullsrc` input.
      Green: Build the stream map from the preset and the probed streams.
      Check: `npx vitest run packages/media packages/compose`
- [ ] **E5** (H10 FR5): Reject unsupported scene kinds before the job starts.
      Wave 3. Worker: `claude-agent/haiku`.
      Files: `packages/storyboard/src/parse.ts`, `apps/web/server/storyboard-api.ts`, tests. Depends on S4 (same files).
      Red: Test: storyboard with a static scene or an asset-only slide is rejected with the scene id before `registry.create`. Test: every supported kind still exports.
      Green: Add one `assertExportable(scene)` check; list the supported kinds in one place.
      Check: `npx vitest run packages/storyboard apps/web/server/storyboard-api.test.ts`

## Phase 2: Rolled up from archived tracks

These phases came from older tracks that overlapped this one. The archived plan holds the full Red and Green detail. Read it first, then re-check each claim against the current code, because the code moved on 2026-11-27.

- [ ] **E6** (from `edit_timeline_integrity_20261122` Phase 1): Versioned edit contract and migrations.
      Wave 5. Worker: `deepseek/deepseek-v4-pro`.
      Detail: `measure/archive/superseded_backend_review_20261127_edit_timeline_integrity_20261122/plan.md`.
      Scope: Versioned edit schema; pure source/output timeline compiler; migrations for old projects, unknown versions and the ambiguous shifted timestamps that older `insertSilence` builds saved. Start from the optional `silences` state added in `7f770d7`; do not undo it. The editing hook calls the compiler; no timeline logic in React.
- [ ] **E7** (from `edit_timeline_integrity_20261122` Phase 2 (rest)): Edited playback and freeze use the same timeline.
      Wave 5. Worker: `openai/gpt-6-luna`.
      Detail: `measure/archive/superseded_backend_review_20261127_edit_timeline_integrity_20261122/plan.md`.
      Scope: Visual-kind and layer matrix; the Edit player plays reordered pieces and inserted silence (it does not play silence today); freeze uses the shared timeline. E2 and E3 already cover export and slide offsets.
- [ ] **E8** (from `edit_timeline_integrity_20261122` Phase 3): Stream normalisation and measured exports.
      Wave 5. Worker: `deepseek/deepseek-v4-pro`.
      Detail: `measure/archive/superseded_backend_review_20261127_edit_timeline_integrity_20261122/plan.md`.
      Scope: Consistent codec, channel and rate for silent, mono and stereo sources; real-media tests with distinct tones and coloured intervals; the offline browser fixture exports an edited project; real renderer tests with `VERBAL_REMOTION_TEST=1`.
- [ ] **E9** (from `save_export_integrity_20261122` Phase 3): Measured export reuse.
      Wave 6. Worker: `deepseek/deepseek-v4-pro`.
      Detail: `measure/archive/superseded_backend_review_20261127_save_export_integrity_20261122/plan.md`.
      Scope: Pure cache keys (source, edit, template, codec, geometry, audio); fast-path eligibility; verified segment reuse; a repeat export performs zero segment encodes; cold and warm timings recorded.

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
