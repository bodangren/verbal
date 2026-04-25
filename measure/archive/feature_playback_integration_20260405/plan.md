# Track: Feature - PlaybackWindow Integration into Main App

**Started:** 2026-04-05  
**Completed:** 2026-04-05  
**Status:** Complete

## Goal
Replace the current basic main.go UI with the `PlaybackWindow` component that provides:
- Split-pane layout (video preview + transcription)
- GStreamer playback with position tracking
- Word-level transcription highlighting synchronized with video
- Editable transcription view with segment selection

## Success Criteria (All Met)
1. `main.go` launches `PlaybackWindow` instead of the basic UI
2. Opening a video file loads it with transcription sync
3. Clicking words in transcription seeks video to that position
4. Tests pass and build succeeds

## Phases

### Phase 1: Wire PlaybackWindow into main.go ✅
- [x] Replace basic UI in `activate()` with PlaybackWindow
- [x] Add file open dialog to load recordings
- [x] Wire recording loader to PlaybackWindow
- [x] Verify build compiles

### Phase 2: Integrate EditableTranscriptionView ✅
- [x] Wire EditableTranscriptionView into PlaybackWindow's transcription pane
- [x] Connect word click events to video seek
- [x] Add segment selection UI for export

### Phase 3: End-to-End Integration ✅
- [x] PlaybackPipeline wired with gtk4paintablesink for embedded video
- [x] PositionMonitor connected to sync.Integration
- [x] Word click → HandleWordClick → SeekTo pipeline working
- [x] Position → Controller → WordContainer highlight pipeline working
- [x] Time display and seek slider update on position changes

### Phase 4: Polish and Cleanup ✅
- [x] Update tech-debt.md (resolved PlaybackWindow integration debt)
- [x] Update lessons-learned.md (6 new lessons from gotk4 API quirks)
- [x] Final build verification: `go build ./cmd/verbal/` succeeds
- [x] All tests pass: `go test ./...` (44+ tests, UI tests skip without display)

## Key Implementation Details

- **appState struct** centralizes all component references (playbackWindow, playback, monitor, syncIntegration, wordContainer, editableView)
- **File open dialog** uses `gtk.FileChooserNative` with video file filters (mp4, mkv, webm, avi, mov)
- **Keyboard shortcuts**: Ctrl+O for open, Ctrl+T for transcribe
- **gtk4paintablesink** created via `gst.ElementFactoryMake()` with paintable property accessed through `ObjectProperty()`
- **Sync adapters** (`uiSyncAdapter`, `playbackSyncAdapter`) bridge the gap between sync.Integration interfaces and concrete types
- **Transcription flow**: After transcription completes, wordContainer is recreated and syncIntegration is restarted automatically
