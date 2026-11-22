# Specification: Edit Timeline Integrity

## Problem

The transcript is not yet a reliable description of exported media.
Deletion can survive inside storyboard ranges.
Reorder and inserted silence do not produce the requested media sequence.
Slides restart the speaker input, and export omits some valid scene kinds.
See [F01–F03 and F12](../../review-2026-11-22.md).

## Goals

1. Preserve source timestamps while representing edits explicitly.
2. Compile one ordered timeline for playback, freeze, preview, and export.
3. Preserve scene offsets, layouts, and all accepted visual kinds.
4. Normalize every assembled segment before concat-copy.

## Non-Goals

- A general nonlinear editor, transitions, effects, or new scene kinds.
- Stream-copy optimization.
- Re-transcribing existing media.
- Guessing the original timestamps of an already corrupted silence edit.

## Functional Requirements

### FR1: Source and edited timeline

- Keep ASR source timestamps immutable.
- Represent deletion, reorder, and inserted silence separately from source timing.
- Each compiled piece names either a source range or a generated silence duration.
- Source pieces preserve requested output order, including backward source seeks.
- Preserve stable word identifiers and reversible undo steps.
- Keep source-time and output-time lookup functions distinct.
- A split changes grouping but not media duration or sample order.
- The ordinary unedited transcript retains existing behavior.
- A fully removed transcript produces an explicit empty timeline.

### FR2: Compatibility

- Define a versioned edit document before implementation.
- Read existing version-one transcripts and removal lists.
- Migrate valid existing projects deterministically.
- Keep original files recoverable.
- Refuse newer unsupported versions.
- Surface a recovery message when existing timestamps cannot be mapped safely.
- Do not silently infer historical silence operations from timestamp gaps.

### FR3: Shared scene compilation

- Build storyboard media from the edited timeline, not a continuous raw span.
- A removed middle word never reappears in a talk or slide scene.
- Carry the resolved source pieces and layer into every rendered scene.
- Support talk, template slide, asset-backed slide, static, generated-image, and generated-video scenes.
- Reject a missing asset or unsupported scene before starting rendering.
- Do not silently omit a valid scene.
- Preserve scene order, including reordered source pieces.
- Use the same compiler for preview and final export.

### FR4: Stream compatibility

- Probe source streams before planning export.
- Every assembled segment contains one video stream and one audio stream.
- Normalize audio to 48 kHz stereo.
- Synthesize silence for a source without audio.
- Keep brand bookends silent.
- Normalize codec settings, pixel format, frame rate, dimensions, and sample aspect ratio.
- Preserve the selected H.264 or VP9 preset.
- Resolve music paths through the safety adapter.

## Acceptance Criteria

- A three-word fixture loses its distinct middle tone when that word is deleted.
- Reordering the last word first changes the measured tone and frame order.
- Inserting one second adds one second of silence without shifting source extraction.
- Split and undo restore the same compiled timeline and source timestamps.
- A slide anchored after zero uses the corresponding later speaker audio and frames.
- Tests cover every accepted visual kind and all three existing layer modes.
- A missing scene fails before any final output appears.
- Silent, mono, and stereo fixtures assemble with identical stream topology.
- Output duration stays within one video frame plus codec delay of the planned duration.
- Existing project fixtures still open and unsupported versions fail clearly.
- `npm run check` and the offline media gate pass.

## Dependencies

`local_safety_20261122` supplies path and schema boundaries.
This track supplies the timeline contract to later export and preview work.

## Risks

- A timing migration can make old projects appear correct while changing their media meaning.
- Word boundaries need existing handle policy to avoid clipping consonants.
- Browser playback and export must share output-time semantics.
- Codec delay needs explicit measurement tolerance.
