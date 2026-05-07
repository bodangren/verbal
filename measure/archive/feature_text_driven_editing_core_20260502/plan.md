# Plan: Text-Driven Editing Core

**Status:** PENDING  
**Created:** 2026-05-02  
**Focus:** Implement the core text-driven media editing operations: delete word, delete sentence, reorder text, insert silence, and split paragraph.

---

## Phase 1: Edit Operation Model

- [ ] Create `internal/edit` package with `Operation` interface (`Apply()`, `Undo()`, `MarshalJSON()`).
- [ ] Write failing tests for `DeleteOperation` applying to a slice of `WordData`.
- [ ] Implement `DeleteOperation` with time-range removal and JSON serialization.
- [ ] Write failing tests for `ReorderOperation` rearranging segments.
- [ ] Implement `ReorderOperation` with source/target index and segment list mutation.
- [ ] Write failing tests for `InsertSilenceOperation` adding gap markers.
- [ ] Implement `InsertSilenceOperation` with duration and position.
- [ ] Write failing tests for `SplitOperation` breaking a segment at a word boundary.
- [ ] Implement `SplitOperation` with boundary binary search.
- [ ] Run tests for `internal/edit` and verify pass.

## Phase 2: Time-Range Mapping

- [ ] Create `TranscriptMapper` in `internal/edit`.
- [ ] Write failing tests for word-level time range extraction (single word, range of words).
- [ ] Write failing tests for sentence/paragraph boundary detection using punctuation.
- [ ] Implement mapper with binary search for start/end boundaries.
- [ ] Verify O(log n) lookup performance with benchmark tests.
- [ ] Run tests and verify pass.

## Phase 3: Media Segment Operations

- [ ] Create `SegmentEditor` interface in `internal/media` for applying edits to media.
- [ ] Write failing tests for single-segment deletion (time-range cut) using GStreamer pipeline.
- [ ] Write failing tests for multi-segment concatenation after reorder.
- [ ] Implement `SegmentEditor` using existing `SegmentExporter` + `gst-launch-1.0` for segment extraction.
- [ ] Write failing tests for silence insertion (gap generation).
- [ ] Implement silence generation with `audiotestsrc` / `videotestsrc` for gap duration.
- [ ] Run tests for `internal/media` editing paths and verify pass.

## Phase 4: UI Integration

- [ ] Add right-click context menu on words in `EditableTranscriptionView`.
- [ ] Write failing tests for menu action callbacks (mock GTK where display is unavailable).
- [ ] Implement "Delete Word", "Delete Sentence", "Split Here" menu items.
- [ ] Add keyboard shortcuts: `Delete` (delete word), `Ctrl+Delete` (delete sentence), `Ctrl+Shift+S` (split).
- [ ] Add undo/redo bindings (`Ctrl+Z`, `Ctrl+Shift+Z`).
- [ ] Run UI package tests and verify pass.

## Phase 5: Export Integration

- [ ] Write failing tests for edited timeline export (mock media where needed).
- [ ] Integrate edit operations into export pipeline: flatten edit history to final segment list.
- [ ] Verify exported media duration matches expected post-edit duration.
- [ ] Run full test suite: `make go-check`.
- [ ] Update `tech-debt.md` and `lessons-learned.md`.
- [ ] Update this plan and `measure/tracks.md` with results.
