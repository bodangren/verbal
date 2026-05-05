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

- [x] Add zoom in/out buttons to PlaybackWindow toolbar
- [x] Wire keyboard shortcuts (Ctrl++, Ctrl+-, Ctrl+0)
- [x] Write failing tests for zoom level state persistence
- [x] Ensure scroll offset is preserved across view switches

## Phase 3: EditTimeline UI Wiring

- [x] Connect EditTimeline operations to segment visualization updates
- [x] Add visual feedback when segments change (delete word highlights affected segment)
- [x] Write failing tests for EditTimeline -> UI update flow
- [x] Implement segment re-rendering after edit operations

## Phase 4: Multi-Track Toggle

- [x] Add multi-track toggle button to PlaybackWindow
- [x] Implement track visibility toggle in WaveformWidget
- [x] Wire multi-track callback to control segment visibility
- [x] Write tests for track visibility state
- [x] Verify segment ordering display is correct

**Note:** This phase was completed via bugfix track `bugfix_multi_track_toggle_20260505` which wired the toggle button to control WaveformWidget segment visibility.

## Phase 5: Integration and Polish

- [x] Wire EditTimeline events to UI callbacks
- [x] End-to-end test: delete word -> segment visualization updates
- [x] Update tech-debt.md and lessons-learned.md
- [x] Run full test suite: `make go-check`
- [x] Verify build succeeds

**Final Status:** COMPLETE - All phases implemented. Timeline visualization integration complete with segment markers on waveform, zoom controls in toolbar, multi-track toggle (properly wired via bugfix), and EditTimeline wiring to PlaybackWindow. All tests pass, build compiles.