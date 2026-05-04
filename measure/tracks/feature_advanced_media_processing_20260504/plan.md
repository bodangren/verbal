# Plan: Advanced Media Processing & Editing

**Status:** PENDING
**Created:** 2026-05-04
**Focus:** Enhance GStreamer-based local editing capabilities with multi-track support, improved segment handling, and timestamp-accurate concatenation.

---

## Phase 1: Multi-Segment Timestamp Rewriting

- [ ] Research timestamp handling for GStreamer segment concatenation
- [ ] Implement timestamp offset computation for each segment
- [ ] Write failing tests for multi-segment timestamp continuity
- [ ] Implement TimestampMapper with offset tracking

## Phase 2: Segment Boundary Handling

- [ ] Research decodebin/playbin segment boundary behavior
- [ ] Implement pre-roll handling for clean segment transitions
- [ ] Write failing tests for gapless playback across segments
- [ ] Integrate with existing SegmentExporter

## Phase 3: Multi-Track Timeline View

- [ ] Create MultiTrackTimeline widget for visualizing multiple segments
- [ ] Write failing tests for track addition/removal
- [ ] Implement segment reordering via drag-and-drop
- [ ] Integrate with EditTimeline in internal/edit

## Phase 4: Export Pipeline Integration

- [ ] Wire multi-segment export with timestamp rewriting
- [ ] Write failing tests for end-to-end multi-segment export
- [ ] Implement progress callback for multi-segment exports
- [ ] Verify stream-copy works across segment boundaries

## Phase 5: UI Integration

- [ ] Add multi-track toggle to PlaybackWindow
- [ ] Implement timeline zoom and scroll
- [ ] Wire EditTimeline events to UI
- [ ] Run full test suite: `make go-check`
- [ ] Update `tech-debt.md` and `lessons-learned.md`
