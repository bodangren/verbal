# Specification: MVP Text-Driven Delete

## Overview

This track implements the minimum viable text-driven editing operation: deleting a single word from the transcript and exporting a new media file with that word's time range removed. This is the core value proposition of Verbal.

## Goals

1. Select and delete a word in the transcript view.
2. Compute the time range of the deleted word.
3. Export a new media file with that time range removed.
4. Preserve audio/video sync and codec compatibility where possible.

## Non-Goals

- Multi-word or sentence deletion (post-MVP).
- Reorder, insert silence, or split (post-MVP).
- Undo/redo (post-MVP).

## Functional Requirements

### FR1: Word Selection & Deletion
- User clicks a word to select it.
- Press Delete key or click a "Delete Word" button.
- The word is removed from the transcript view.

### FR2: Segment Computation
- `internal/edit` computes a `Segment` representing the deleted word's time range.
- For a single-word delete, the segment is `[word.Start, word.End]`.

### FR3: Media Pipeline
- `internal/media/pipeline` provides a `SegmentExporter`.
- For a single cut, it exports the media before and after the segment, concatenating them.
- Uses stream-copy when source and output codecs match; re-encodes otherwise.
- Handles audio/video sync and frame-accurate boundaries.

### FR4: Export UI
- Export dialog shows the output path and format.
- Progress is reported.
- On success, the exported file is revealed or opened.

### FR5: Transcript Update
- After deletion, the transcript is updated in the database with the word removed.
- Remaining word timestamps are not shifted in the stored transcript; the exported media simply omits the segment.

## Acceptance Criteria

- [ ] Selecting a word and deleting it triggers the segment exporter.
- [ ] Exported file has the word's time range removed.
- [ ] Audio and video remain in sync.
- [ ] Stream-copy is used when codecs match; re-encode fallback works otherwise.
- [ ] Pipeline is tested with real media fixtures or a mocked GStreamer runner.
- [ ] `make check` passes.
