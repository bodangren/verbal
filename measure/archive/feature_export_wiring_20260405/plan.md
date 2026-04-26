# Track: Feature - Segment Export Wiring

**Started:** 2026-04-05
**Status:** In Progress

## Goal
Wire the segment export functionality end-to-end: from UI selection → main.go callback → media.SegmentExporter → GStreamer pipeline → user feedback.

## Problem
The export callback in `main.go:242-250` is a stub that only shows an error message. The `media.SegmentExporter` and `ui.EditableTranscriptionView` are fully implemented but not connected.

## Phases

### Phase 1: Wire Export Callback (Core)
- [x] Replace stub callback in main.go with real export logic
- [x] Create conversion function: `ui.Segment` → `media.Segment`
- [x] Wire `media.SegmentExporter` with progress/error callbacks
- [x] All UI updates wrapped in `glib.IdleAdd()`

### Phase 2: Save Dialog and Progress UI
- [x] Show file save dialog for choosing export destination
- [x] Display progress indicator during export
- [x] Show success/error notifications

### Phase 3: Verify
- [x] Run tests and build
- [x] Update tech-debt.md and lessons-learned.md
- [x] Commit and push

## Success Criteria
- User selects words in EditableTranscriptionView → clicks export → save dialog appears
- Export runs asynchronously with progress feedback
- Exported video file is playable
- Errors are surfaced to the user
