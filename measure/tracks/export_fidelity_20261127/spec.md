# Spec: Export Fidelity

Source: Astra backend review of 2026-11-27 at `c6dc3f4`. Claims H01 and H03 were re-read in code by the orchestrator.

## Problem

- **H01.** The plain export route builds its cut list with `buildCutList({transcript, durationSeconds})`, which handles deletions only (`apps/web/pages/api/export.ts:47-65`; `packages/media/src/cutlist.ts:107-146`). Reorder and inserted silence do not reach the file. Freezing uses the same planner (`packages/cleanup/src/freeze.ts:95-111`), so the freeze fingerprint ignores them too.
- **H03.** `planAssembly` keeps `durationSeconds` and drops the scene start (`packages/compose/src/assemble.ts:71-79`). Slide and asset composites open the speaker input with no seek (`packages/compose/src/render-step.ts:150-168,194-212`). A slide anchored at 30 s plays speech from 0 s. The integration fixture uses a scene at 0 s, so no test sees it.
- **M01.** Unedited words that overlap in time (`0-1`, `0.8-2`) make two video ranges, so the overlap plays twice (`apps/web/server/talk-ranges.ts:101-112`).
- **M02.** Audio-only presets still read `[0:v]` and map `[vout]` (`packages/media/src/presets.ts:50-58`, `packages/media/src/export.ts:72-99`). Unmuted slides need `[1:a]` even over silent video (`packages/compose/src/composite.ts:155-162`).
- **H10.** The storyboard schema accepts static scenes and slides with only an asset id. Export handles neither, so a mixed storyboard can finish with scenes missing (`packages/storyboard/src/parse.ts:71-85`, `apps/web/server/storyboard-api.ts:239-305`).

## Requirements

1. FR1. One pure function turns a transcript into an ordered list of source pieces plus silences. The plain export, the freeze fingerprint, and the Deliver talk scenes all call it. `computeTalkItems` is the starting point; move it to `packages/core` or `packages/media`, keep its tests.
2. FR2. Composite steps seek the speaker input to the scene start (`-ss` before `-i`, argv array).
3. FR3. Words that overlap with no edit between them merge into one range.
4. FR4. An audio-only preset exports with no video map. A source with no audio still exports with generated silent audio when the recipe needs audio.
5. FR5. The export validates every scene kind before the job starts. An unsupported scene is rejected with its id. No supported scene is dropped silently.

## Acceptance

- Tests for each requirement fail on `c6dc3f4`, pass after the fix.
- A measured fixture: a slide scene anchored at 30 s with two distinct tones before and after 30 s; the exported tone under the slide matches the 30 s source tone.
- Plain export of a reordered transcript has the new order (probe duration and tone order).
