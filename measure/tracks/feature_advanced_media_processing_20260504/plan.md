# Plan: Advanced Media Processing & Editing

**Status:** IN PROGRESS (Phases 1-4 complete, Phase 5 partial)
**Created:** 2026-05-04
**Focus:** Enhance GStreamer-based local editing capabilities with multi-track support, improved segment handling, and timestamp-accurate concatenation.

---

## Phase 1: Multi-Segment Timestamp Rewriting

- [x] Research timestamp handling for GStreamer segment concatenation
- [x] Implement timestamp offset computation for each segment
- [x] Write failing tests for multi-segment timestamp continuity
- [x] Implement TimestampMapper with offset tracking

## Phase 2: Segment Boundary Handling

- [x] Research decodebin/playbin segment boundary behavior
- [x] Implement pre-roll handling for clean segment transitions
- [x] Write failing tests for gapless playback across segments
- [x] Integrate with existing SegmentExporter

## Phase 3: Multi-Track Timeline View

- [x] Create MultiTrackTimeline widget for visualizing multiple segments
- [x] Write failing tests for track addition/removal
- [x] Implement segment reordering via drag-and-drop
- [x] Integrate with EditTimeline in internal/edit

## Phase 4: Export Pipeline Integration

- [x] Wire multi-segment export with timestamp rewriting
- [x] Write failing tests for end-to-end multi-segment export
- [x] Implement progress callback for multi-segment exports
- [x] Verify stream-copy works across segment boundaries

## Phase 5: UI Integration

- [c] Add multi-track toggle to PlaybackWindow - deferred (CGo build timeout)
- [c] Implement timeline zoom and scroll - deferred (CGo build timeout)
- [c] Wire EditTimeline events to UI - deferred (CGo build timeout)
- [x] Run full test suite: `make go-check`
- [x] Update `tech-debt.md` and `lessons-learned.md`
