# Current Directive: Video Thumbnails for Library Items

## Active Directive
**Video Thumbnails for Library Items** - Generate video thumbnails for recording library items to provide visual previews in the library view.

## Previous Completed Work
- [x] Waveform Visualization in Playback View (All 5 Phases complete)
- [x] Settings UI for AI Provider Configuration (All 4 Phases complete)
- [x] Recording Library View (2026-04-07)
- [x] PlaybackWindow fully integrated into main application
- [x] Edit Transcription and Export Cuts
- [x] Video Playback with Transcription Sync

## Current Track: Video Thumbnails for Library Items
**Status:** In Progress - Starting Phase 1
**Goal:** Generate video thumbnails for recording library items using GStreamer frame extraction

### Phase 1: Database Schema and Storage
- Add thumbnail columns to recordings table
- Create ThumbnailRepository for thumbnail operations
- Update RecordingRepository to include thumbnail data

### Phase 2: Thumbnail Generation Service
- Create ThumbnailGenerator type with GStreamer pipeline
- Implement frame extraction at 1-second mark
- Implement image resizing and encoding (160x90 JPEG)
- Add async generation with progress callback

### Phase 3: Library View UI Integration
- Create ThumbnailWidget for GTK
- Integrate thumbnail display into LibraryWindow
- Add placeholder and loading states
- Add duration overlay on thumbnails

### Phase 4: Background Generation and Caching
- Create ThumbnailService orchestrator
- Implement generation on library view open
- Add thumbnail freshness checks

### Phase 5: Testing and Polish
- Write integration tests
- Optimize memory usage
- Handle edge cases

## Success Criteria
- Thumbnails display for all video recordings in library view
- Thumbnails are generated at 160x90 resolution as JPEG
- Thumbnails persist across application restarts
- Generation happens in background without blocking UI
- Placeholder shown during generation and for failed/corrupt videos
- Duration overlay displays correctly on thumbnails
- All tests pass with >80% coverage
- Memory usage remains stable during batch thumbnail generation

## Future Roadmap (After This Track)
- Import/export of recording library
- Recording categories/tags
- Advanced Media Processing & Editing

## Timeline
- Video Thumbnails started: 2026-04-09
- Target completion: 2026-04-11 (estimated)