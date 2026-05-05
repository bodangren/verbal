# Plan: Multi-Track Toggle Fix

**Status:** IN PROGRESS
**Created:** 2026-05-05
**Focus:** Fix incomplete multi-track toggle implementation - button exists but doesn't control segment visibility.

---

## Phase 1: Add track visibility state to WaveformWidget

- [x] Add `tracksVisible bool` field to WaveformWidget struct
- [x] Initialize `tracksVisible = true` in NewWaveformWidget
- [x] Add `SetTrackVisibility(visible bool)` method
- [x] Add `IsTrackVisibility() bool` getter method

## Phase 2: Wire multi-track toggle to control visibility

- [x] Add SetMultiTrackVisibility method to PlaybackWindow
- [x] Wire PlaybackWindow.SetMultiTrackToggleCallback to call SetMultiTrackVisibility in main.go

## Phase 3: Write tests for track visibility

- [x] Write unit test for SetTrackVisibility and IsTrackVisibility

## Phase 4: Verify and finalize

- [ ] Run go vet and verify no errors
- [ ] Run tests and verify they pass
- [ ] Update tracks.md and mark track complete
- [ ] Commit with note about model name