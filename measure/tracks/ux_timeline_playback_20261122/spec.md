# Specification: Edited Timeline and Playback

## Problem

The waveform is a flat image with a playhead. It does not show what the edit keeps or cuts.
It does not show the selection. It has no zoom.
Playback plays the source. It plays through deleted words, so the user cannot hear the edit.
The player time is source time. The waveform image is a click target with no keyboard path.
See [the UX review](../../review-ux-2026-11-22.md), findings U05 and U18,
and the target screen `target-edit.jpg`.

## Goals

1. Show kept and cut ranges, the selection, and the playhead on one timeline.
2. Play the edit: skip cuts and honour order and silence.
3. Let the user switch between the edit and the source.
4. Make the timeline usable with the keyboard.

## Non-Goals

- Multi-track editing, trimming by handle, or snapping.
- A new waveform renderer. The cached `showwavespic` image stays.
- Export changes.

## Functional Requirements

### FR1: Timeline overlay

- The timeline draws the waveform with an overlay: cut ranges hatched in `text-tertiary`, kept ranges plain.
- The selection draws as an indigo tint with start and end markers.
- The playhead is a 2px indigo line per `DESIGN.md`.
- Zoom In, Zoom Out, and Fit buttons change the visible span. The zoom level shows as a percent.
- Ranges come from the compiled timeline of `export_fidelity_20261127`. The overlay never computes its own cut list.

### FR2: Play the edit

- Default playback mode is Edit. Playback jumps over cut ranges and follows the compiled order.
- Inserted silence plays as a pause of that length.
- A Source toggle plays the original media without jumps.
- The time readout shows edited time in Edit mode and source time in Source mode, and names the mode.
- The active word highlight follows in both modes.
- A jump over a cut lands within 50 ms of the next kept start.

### FR3: Keyboard and pointer

- The timeline is a `role="slider"` with `aria-valuetext` in the current time mode.
- Left and Right step 1 s. Shift with them steps 5 s. Home and End go to the ends.
- A pointer drag on the timeline selects the words under the dragged span.
- K or Space plays or pauses when the timeline has focus. J and L step back and forward 5 s.
- The waveform image has explicit width and height and `alt=""`.

## Acceptance Criteria

- An e2e step deletes the words at 1.5–2.4 s, plays from 1.2 s in Edit mode, and never finds a removed word active.
- The same step in Source mode finds the removed word active.
- An e2e step moves a word later and finds the playback order match the text order.
- An e2e step inserts 1 s of silence and measures a pause of 1 s ± 0.1 s.
- An e2e step drags on the timeline and finds the words under the span selected.
- The cut overlay count equals the cut count in the Edit inspector summary.
- The timeline has `role="slider"` and a time value text; the gate finds its accessible name.
- `npm run check`, `npm run e2e`, and the UX gate pass.

## Dependencies

- `export_fidelity_20261127`. The overlay and playback need one compiled edited timeline.
  Without it, the timeline would show cuts that playback and export ignore (F01, F02).
- `fe_transcript_20261127` for the selection model.
- `ux_edit_inspector_20261122` for the cut count that the overlay must match.

## Risks

- HTML video seeks are not frame-exact. Measure the jump gap and record it.
- Long media with many cuts can stutter. Schedule the next jump with `requestVideoFrameCallback` when present.
- The hatch pattern must stay readable at 3:1 against the waveform.

## Verification

Use generated media with a tone that changes each second, so a measured gap is clear.
Use the shared heavy runner for the build and the browser.
Never call a paid API.
