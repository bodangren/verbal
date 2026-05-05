# Plan: Timeline Visualization Integration

**Status:** IN PROGRESS
**Created:** 2026-05-05
**Focus:** Wire EditTimeline into PlaybackWindow, implement segment visualization, and add timeline zoom/scroll controls for multi-track editing.

---

## Phase 1: Segment Visualization on Waveform

- [x] Research segment marker rendering approach (overlay vs separate track)
- [x] Extend WaveformWidget with segment markers
- [x] Write failing tests for segment marker rendering
- [x] Implement segment overlay that shows boundaries

## Phase 2: Timeline Zoom and Scroll Controls

- [ ] Add zoom in/out buttons to PlaybackWindow toolbar
- [ ] Wire keyboard shortcuts (Ctrl++, Ctrl+-, Ctrl+0)
- [ ] Write failing tests for zoom level state persistence
- [ ] Ensure scroll offset is preserved across view switches

## Phase 3: EditTimeline UI Wiring

- [ ] Connect EditTimeline operations to segment visualization updates
- [ ] Add visual feedback when segments change (delete word highlights affected segment)
- [ ] Write failing tests for EditTimeline -> UI update flow
- [ ] Implement segment re-rendering after edit operations

## Phase 4: Multi-Track Toggle

- [ ] Add multi-track toggle button to PlaybackWindow
- [ ] Implement track visibility toggle in WaveformWidget
- [ ] Write failing tests for track visibility state
- [ ] Verify segment ordering display is correct

## Phase 5: Integration and Polish

- [ ] Wire EditTimeline events to UI callbacks
- [ ] End-to-end test: delete word -> segment visualization updates
- [ ] Update tech-debt.md and lessons-learned.md
- [ ] Run full test suite: `make go-check`
- [ ] Verify build succeeds

**Final Status:** IN PROGRESS