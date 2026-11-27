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

- [x] **E1** (M01 FR3): Merge overlapping unedited words into one range. 120adb8
      Evidence: 26 talk-range tests green; Red showed ranges 0-1 and 0.8-2.
      Wave 1. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/server/talk-ranges.ts`, `apps/web/server/talk-ranges.test.ts`.
      Red: Test: unedited words `0-1` and `0.8-2` give one range `0-2`. Test: the same words with a deletion between them stay split. Test: a reorder across the overlap stays split.
      Green: Merge ranges when the next start is before the previous end and no edit lies between them.
      Check: `npx vitest run apps/web/server/talk-ranges.test.ts`
- [x] **E3** (H03 FR2): Carry the scene start into composites and seek the speaker input. 90fcc79
      Wave 1. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Files: `packages/compose/src/assemble.ts`, `packages/compose/src/render-step.ts`, `packages/compose/src/composite.ts`, tests. Add a measured test in `packages/compose/src/render-step.integration.test.ts` with a scene at 30 s and two tones.
      Red: Unit test: the composite argv holds `-ss <start>` before the speaker `-i`. Integration test (needs ffmpeg, runs through the heavy lock): speech under a slide at 30 s matches the 30 s tone.
      Green: Add `startSeconds` to the scene step. Pass it into `CompositeRequest.speaker`. Emit `-ss` in `buildCompositeArgs`.
      Check: `npx vitest run packages/compose`
- [x] **E2** (H01 FR1): One ordered timeline for plain export, freeze and Deliver talk scenes. a582319
      Evidence: 201 media, cleanup, talk-range, route and storyboard tests green. First pass was sent back (it dropped the head and tail of an unedited file and required geometry for plain cuts). Gap: `buildCutList` still serves `computeTalkRanges` and the freeze cut list; silence audio is fixed 48 kHz stereo (E8).
      Wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/server/talk-ranges.ts` (move or re-export), `packages/media/src/cutlist.ts`, `apps/web/pages/api/export.ts`, `packages/cleanup/src/freeze.ts`, tests. Depends on S1 and E1.
      Red: Test: plain export of a reordered transcript passes the new order to the runner. Test: inserted silence reaches the plain export. Test: changing only the order changes the freeze fingerprint. Test: equivalence with `computeTalkItems` on the existing fixtures.
      Green: Extract the pure timeline builder. Make `buildCutList` consume it. Keep the old output for transcripts without reorder or silence (snapshot test).
      Check: `npx vitest run packages/media packages/cleanup apps/web/server/talk-ranges.test.ts apps/web/server/export-route.test.ts`
- [x] **E4** (M02 FR4): Audio-only presets and silent-audio synthesis. 3c587f9
      Evidence: 227 media and compose tests green; a measured audio-only export has one audio stream and no video. Gap: no caller passes `speaker.hasAudio` yet; silent audio is fixed 48 kHz stereo (E8).
      Wave 3. Worker: `opencode-go/mimo-v2.6-flash`.
      Files: `packages/media/src/presets.ts`, `packages/media/src/export.ts`, `packages/compose/src/composite.ts`, tests. Depends on S1 (same `export.ts`).
      Red: Test: an audio-only preset yields argv with no `-map [vout]` and no `[0:v]`. Test: a source without audio and a recipe that needs audio gets `anullsrc` input.
      Green: Build the stream map from the preset and the probed streams.
      Check: `npx vitest run packages/media packages/compose`
- [x] **E4b** (M02 follow-up from E4): Pass the probed `hasAudio` into the compositor. 86ea2ba
      Evidence: 161 compose and storyboard tests green; Red showed the no-audio export reading `[1:a]`. Note: the probe runs before the job starts, one ffprobe call; a failed probe returns true.
      Wave 6. Worker: `claude-agent/haiku`.
      Files: `apps/web/server/storyboard-api.ts`, `packages/compose/src/render-step.ts`, tests.
      Red: a storyboard export over a source with no audio stream builds composites with `speaker.hasAudio: false`.
      Green: read the audio stream from the existing probe and pass it into `speakerFor`.
- [x] **E5** (H10 FR5): Reject unsupported scene kinds before the job starts. e42cfbb
      Evidence: 103 storyboard tests green; Red showed 202 for static, asset-only slide and asset-less generated scenes. Gap: the preview route still lists unsupported scenes.
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

## Phase R2: Acceptance fixes (Sol review, 2026-11-27)

The independent acceptance review rejected or conditionally accepted this track. Each task below reopens a finding it verified. Same worker rules as Phase 1.

- [x] **E2b** (H01a (Sol: verified for the empty and overlapping cases)): Restore deletion-only equivalence in the ordered timeline. ab82085
      Evidence: 179 media, cleanup and route tests green; Red showed 4 failures (empty transcript, removed first word, removed last word, generated oracle). The unedited, no-reorder, no-silence case now delegates to `buildCutList`, so it inherits its 0.02 s sliver drop. Freeze fingerprint stability stays with E2d.
      wave 1. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/media/src/timeline.ts`, `packages/media/src/timeline.test.ts`, `packages/media/src/cutlist.ts` (read only).
      Red: Tests against `buildCutList` as the oracle: an empty transcript with a duration gives the whole file; a removed first word keeps the head; a removed last word keeps the tail; overlapping removals never give a zero-length or reversed range; combined edits (delete plus reorder plus silence) stay valid.
      Green: Decide the rule once (the old planner keeps every source second that is not inside a removed word plus handle) and implement it; never emit an item with end <= start.
- [x] **E2c** (H01b (Sol: verified by a real FFmpeg run)): Render inserted silence at the decoded video geometry. 9640343
      Evidence: 128 media and route tests green. Measured with real ffmpeg: a 160x120 source with a 90 degree display rotation plus 1 s of silence exports to 3.000 s video and 3.000 s audio at 120x160. Not covered by a measured test: non-integer frame rates such as 29.97.
      wave 2. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/pages/api/export.ts`, `packages/media/src/export.ts`, `packages/media/src/probe.ts`, tests.
      Red: Test: a source with a 90 degree display rotation plus an inserted silence exports (measured with ffprobe: video and audio durations match). Test: the silence item uses the display width and height.
      Green: Take the display geometry from the probe (swap width and height for a 90 or 270 degree rotation) and normalise the sample aspect ratio before concat.
- [x] **E2d** (H01c (Sol: verified)): Derive the frozen result from the ordered timeline and keep old fingerprints stable. 7439eb5
      Evidence: 453 cleanup, media and server tests green; Red showed 5 failures (reorder cut list, silence anchors, three legacy fingerprint cases). Fingerprint v2 plus a legacy match for unedited projects. Gap: a project frozen between E2 and E2d stored an unversioned fingerprint and will re-anchor once.
      wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `packages/cleanup/src/freeze.ts`, tests.
      Red: Test: anchors, cut list and master duration come from `buildTimeline`; the fingerprint of an unedited project equals the pre-E2 value (store a fixture hash) or is migrated explicitly.
      Green: Use one timeline for all four values; version the fingerprint input so old fingerprints are recognised.
- [x] **E4c** (M02 (Sol: verified)): Give silent talk segments an audio stream. f10dfb5
      Evidence: 133 compose tests green; a measured cut of a video-only clip probes one video and one audio stream within 0.1 s of 1.5 s. Orchestrator fix: the worker used stereo silence, but the brand and composite silences are mono and the concat copies streams, so the talk silence is mono. A stereo or mono SOURCE with audio still keeps its own layout (E8).
      wave 2. Worker: `claude-agent/haiku`.
      Files: `packages/compose/src/render-step.ts`, `packages/compose/src/video-range.ts`, tests.
      Red: Test: a talk segment cut from a source with no audio contains an `anullsrc` input so it concatenates with slide segments.
      Green: Pass `hasAudio` into the video-range builder and add the silent input when false.
- [x] **E5b** (H10 (Sol: verified)): Test the generated-video export and remove scene-id collisions. c73dfff
      Evidence: 358 server and storyboard tests green; Red showed the old id `talk#2` overwriting a talk piece. Provenance manifests now list `__talk-piece-N`. Document scene ids that start with `__` are rejected.
      wave 3. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/server/storyboard-api.test.ts`, `apps/web/server/storyboard-api.ts` (id mapping only).
      Red: Test: a mixed storyboard with talk, template slide, generated image and generated video completes assembly. Test: a document scene id that equals a derived talk-piece id does not collide.
      Green: Use internal identifiers that a document id cannot equal (a reserved prefix).

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `openai/gpt-6.2-sol`, report-only, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
