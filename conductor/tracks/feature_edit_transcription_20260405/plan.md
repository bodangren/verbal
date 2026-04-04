# Track: Feature - Edit Transcription and Export Cuts

**Type:** feature  
**Date:** 2026-04-05  
**Status:** In Progress  

## Focus
Enable users to edit transcription text and export video cuts based on transcription segments.

## Context
- Video sync feature completed (Phases 1-5)
- Transcription results are stored with word-level timestamps
- Playback window shows synchronized highlighting
- Missing: ability to edit transcription, select segments, and export cuts

## Tasks

### Task 1: Editable transcription view
- [x] Make transcription text editable in the UI
- [ ] Update word timestamps when text is modified
- [ ] Preserve word-level highlighting during edits

### Task 2: Segment selection
- [x] Allow users to select ranges of words/phrases
- [x] Visual feedback for selected segments
- [ ] Support multiple segment selection

### Task 3: Export cuts via GStreamer
- [x] Implement trim/concat using GStreamer pipelines
- [x] Export selected segments as new video files
- [x] Progress reporting during export

### Task 4: Wire into main UI
- [x] Add export button to playback window
- [x] Add segment selection UI controls
- [ ] Integrate with existing metadata save/load

## Acceptance Criteria
- [x] Users can edit transcription text in the UI
- [x] Users can select word ranges for export
- [x] Export produces correct video segments
- [x] All tests pass
- [x] Build succeeds
