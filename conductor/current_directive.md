# Current Directive: Waveform Visualization Implementation

## Active Directive
**Waveform Visualization in Playback View** - Implement audio waveform visualization that displays amplitude over time, synchronized with video playback.

## Previous Completed Work
- [x] Settings UI for AI Provider Configuration (All 4 Phases complete)
- [x] Recording Library View (2026-04-07)
- [x] PlaybackWindow fully integrated into main application
- [x] Edit Transcription and Export Cuts
- [x] Video Playback with Transcription Sync

## Current Track: Waveform Visualization
**Status:** New - Starting Phase 1
**Goal:** Add audio waveform visualization to playback view

### Phase 1: Core Waveform Data Generation
- Create WaveformGenerator with GStreamer pipeline
- Implement audio downsampling and amplitude extraction
- Create WaveformCache for data persistence in SQLite

### Phase 2: GTK4 Waveform Widget
- Create custom WaveformWidget extending gtk.DrawingArea
- Implement Cairo-based waveform rendering
- Add playback position indicator and click-to-seek

### Phase 3: Integration with Playback View
- Add WaveformWidget to PlaybackWindow layout
- Wire to PositionMonitor for sync
- Add loading state UI

### Phase 4: Advanced Features
- Horizontal scrolling for large files
- Zoom in/out capabilities
- Time range selection

### Phase 5: Polish and Testing
- Hover tooltips with timestamps
- Performance optimization
- Dark theme compatibility
- Integration tests with >80% coverage

## Success Criteria
- Waveform displays correctly for video files with audio
- Waveform generation completes within 5 seconds for 10-minute video
- Clicking waveform seeks video to correct position (±100ms accuracy)
- Position indicator stays synchronized during playback
- Cached waveform loads instantly on reopening file
- UI remains responsive during waveform generation
- Tests achieve >80% coverage

## Future Roadmap (After This Track)
- Video thumbnail generation for library items
- Import/export of recording library
- Recording categories/tags

## Timeline
- Waveform Visualization started: 2026-04-08
- Target completion: 2026-04-10 (estimated)
