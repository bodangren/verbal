# Current Directive: Recording Library View Implemented

## Active Directive
**Recording Library View is now the main entry point. Database-backed library with search is live.**

## Completed
- [x] PlaybackWindow fully integrated into main application
  - Phase 1: Core sync controller (98.8% test coverage)
  - Phase 2: Word widgets (clickable, highlightable labels)
  - Phase 3: GStreamer playback integration (gtk4paintablesink embedded)
  - Phase 4: Main window split-pane layout (PlaybackWindow with file open dialog)
- [x] **Recording Library View** (2026-04-07)
  - Phase 1: Database integration with ListRecent, SearchByPath, UpdateOrInsert
  - Phase 2: LibraryView and RecordingListItem GTK4 components
  - Phase 3: Main window integration with GtkStack view switching

## Success Criteria (All Met)
- Library view shows on app startup when database is available
- Recordings are automatically added to library when opened
- Search filters recordings by path and transcription content
- Double-click/Enter on recording opens it in playback view
- Ctrl+L shortcut returns to library view from playback
- Database persists recordings and transcription status
- UI follows GNOME HIG with proper spacing and colors
- Database test coverage: 81.8%

## Changes Made
- `internal/db`: Added RecordingService with GetLibrary, Search, AddRecording, UpdateTranscription
- `internal/db`: Extended repository with ListRecent, SearchByPath, UpdateOrInsert
- `internal/ui`: New LibraryView container with search and recording list
- `internal/ui`: New RecordingListItem widget with metadata display
- `internal/ui`: Added CSS styles for library components
- `cmd/verbal/main.go`: Integrated GtkStack for library/playback switching

## Next Steps
- Settings UI for AI provider configuration
- Waveform visualization in playback view
- Video thumbnail generation for library items
- Import/export of recording library
- Recording categories/tags

## Timeline
- Library View started: 2026-04-07
- Library View completed: 2026-04-07
