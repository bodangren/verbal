# Track: Batch Transcription Queue

## Problem
Users must transcribe media files one at a time. There is no way to queue multiple files for overnight or background processing.

## Goal
Add a batch queue where users can drop multiple media files and have them transcribed sequentially with progress tracking.

## Acceptance Criteria
- [ ] Batch queue accepts multiple media files via file picker or drag-and-drop
- [ ] Queue persists to SQLite (survives app restart)
- [ ] Sequential processing with per-file progress
- [ ] Results saved to library automatically on completion
- [ ] Cancel/pause individual items or entire queue
- [ ] Tests pass
- [ ] Build and vet clean
