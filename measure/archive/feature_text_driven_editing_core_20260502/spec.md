# Specification: Text-Driven Editing Core

## Overview

Verbal's central value proposition is editing media by modifying a transcript. Currently, the application supports viewing transcripts, playback sync, and waveform visualization, but users cannot actually edit the transcript to modify the underlying media. This track implements the v1 editing operations defined in the product vision.

## Requirements

- **Delete Word:** Removing a word from the transcript removes its corresponding time range from the media timeline.
- **Delete Sentence:** Removing a sentence (or paragraph) cuts the full contiguous time range.
- **Reorder Text:** Dragging or using commands to reorder transcript segments rearranges the media timeline accordingly.
- **Insert Silence:** Adding a silence marker inserts a gap of configurable duration in the media timeline.
- **Split Paragraph:** Splitting a paragraph at the cursor creates a new independent segment.
- **Edit History:** Support undo/redo for all editing operations.
- **Timeline Model:** Maintain an in-memory edit timeline that maps transcript state to media segments.
- **Export Integration:** Edited timelines must produce correct exported media via the existing `SegmentExporter`.

## Acceptance Criteria

- [ ] All five v1 editing operations have corresponding Go structs implementing an `Operation` interface.
- [ ] Each operation has comprehensive unit tests validating behavior before implementation (TDD).
- [ ] `TranscriptMapper` correctly maps text selections to time ranges with O(log n) boundary lookups.
- [ ] GTK UI exposes editing actions via context menus and keyboard shortcuts in `EditableTranscriptionView`.
- [ ] Export pipeline produces media that accurately reflects the edited transcript.
- [ ] `go test ./...`, `go build ./...`, and `go vet ./...` all pass.
- [ ] `tech-debt.md` and `lessons-learned.md` are updated with any new patterns discovered.
