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
- [ ] Make transcription text editable in the UI
- [ ] Update word timestamps when text is modified
- [ ] Preserve word-level highlighting during edits

### Task 2: Segment selection
- [ ] Allow users to select ranges of words/phrases
- [ ] Visual feedback for selected segments
- [ ] Support multiple segment selection

### Task 3: Export cuts via GStreamer
- [ ] Implement trim/concat using GStreamer pipelines
- [ ] Export selected segments as new video files
- [ ] Progress reporting during export

### Task 4: Wire into main UI
- [ ] Add export button to playback window
- [ ] Add segment selection UI controls
- [ ] Integrate with existing metadata save/load

## Acceptance Criteria
- [ ] Users can edit transcription text in the UI
- [ ] Users can select word ranges for export
- [ ] Export produces correct video segments
- [ ] All tests pass
- [ ] Build succeeds
