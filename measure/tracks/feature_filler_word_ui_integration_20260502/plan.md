# Plan: Filler Word Detection UI Integration

**Status:** PENDING  
**Created:** 2026-05-02  
**Focus:** Integrate the existing internal/filler package into the transcript UI: highlight filler words, display a summary panel with counts, and implement one-click removal of individual or all filler words.

---

## Phase 1: Filler Detection Service

- [x] Create `internal/filler/service.go` with `FillerService` struct.
- [x] Write failing tests for `FillerService` initialization with `DefaultDetector`.
- [x] Write failing tests for `GetFillers(recordingID)` fetching transcription from DB and running detection.
- [x] Write failing tests for caching layer (second call returns cached results without re-running detection).
- [x] Implement service with progress callback support (`UpdateProgress(percent, message)`).
- [x] Run `internal/filler` tests and verify pass.

## Phase 2: Transcript Visual Highlighting

- [x] Add `filler-word` CSS class to `styling.go` with a distinct color (e.g., amber `#F59E0B`) and ensure WCAG AA contrast against dark background.
- [x] Write failing tests for `VirtualizedWordContainer` applying filler CSS class to specific pool indices.
- [x] Modify `EditableTranscriptionView` to accept a `[]int` of filler word indices and apply `filler-word` class.
- [x] Ensure filler highlight does not conflict with playback highlight (both can coexist or filler takes precedence).
- [x] Run UI tests and verify pass.

## Phase 3: Filler Summary Panel

- [x] Create `FillerSummaryWidget` in `internal/ui` using GTK4 (e.g., `gtk.Box` or `adw.StatusPage`).
- [x] Write failing tests for widget update with a slice of `FillerWord` results.
- [x] Display counts by `FillerType`: short fillers, discourse markers, repetition, dead air.
- [x] Add "Jump to Next Filler" and "Jump to Previous Filler" buttons.
- [x] Add "Remove All Fillers" button (disabled during active removal).
- [x] Integrate panel into `PlaybackWindow` as a bottom or side panel.
- [x] Run UI tests and verify pass.

## Phase 4: One-Click Removal

- [x] Write failing tests for `RemoveFiller(recordingID, fillerWord)` computing correct time range.
- [x] Implement removal using `SegmentExporter` to cut the filler time range and rebuild media.
- [x] Write failing tests for batch "Remove All" flattening multiple time ranges.
- [ ] Implement batch removal with progress dialog (`SetExportingState`-style disable + progress bar).
- [ ] Update transcript data in SQLite after removal (delete filler words, shift subsequent timestamps).
- [ ] Refresh `EditableTranscriptionView` and `FillerSummaryWidget` after removal.
- [ ] Run media + UI integration tests and verify pass.

Note: Core FillerRemovalService implemented. Full integration (progress dialog, SQLite updates, UI refresh) requires additional work.

## Phase 5: Menu Integration and Polish

- [ ] Add "Detect Fillers" menu item to Tools menu in `cmd/verbal/main.go`.
- [ ] Assign keyboard shortcut `Ctrl+Shift+F`.
- [ ] Write integration test for full workflow: detect → highlight → remove → verify export.
- [ ] Update user-facing labels and tooltips.
- [ ] Run full test suite: `make go-check`.
- [ ] Update `tech-debt.md` and `lessons-learned.md`.
- [ ] Update this plan and `measure/tracks.md` with results.
