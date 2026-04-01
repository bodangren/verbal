# Tech Debt

## Go + GTK4 Implementation (Current)

### High Severity
*(none currently)*

### Medium Severity
- **Embedded video preview requires gstreamer1.0-plugins-bad** - The code supports embedded preview via gtk4paintablesink, but users must install `gstreamer1.0-plugins-bad`. Falls back to external window if plugin not available. [severity: medium]

### Low Severity
- No Go tests for cmd/verbal main package (requires display for GTK). [severity: low]
- Libadwaita integration skipped due to Go 1.24 requirement. [severity: low]
- Media package test coverage at 46.8% - GStreamer pipeline tests require display/video files. [severity: low]
- ~~Google Speech API uses LINEAR16/16kHz — may need format conversion for non-WAV recordings.~~ [resolved: 2026-03-30 - Added FFmpeg audio extraction in transcription service]
- ~~Backoff jitter not implemented; uses simple exponential backoff.~~ [resolved: 2026-03-30 - Added ±25% jitter to prevent thundering herd]
- ~~Video sync core implementation~~ [resolved: 2026-04-02 - Phase 3 complete: PositionMonitor, PlaybackPipeline, SyncIntegration all implemented with tests]

## Resolved

- ~~Transcription workflow regression~~ - Wired transcription into main.go with Transcribe button, TranscriptionView, progress callback, and metadata save. AI provider stubs are intentional (REST API pattern). [resolved: 2026-03-28]
- ~~GStreamer video sink uses separate window~~ - Implemented embedded preview using gtk4paintablesink with fallback to autovideosink. [resolved: 2026-03-26]
- ~~Recording pipeline uses test sources~~ - Now uses real hardware (v4l2src + pulsesrc) with graceful fallback to test sources. [resolved: 2026-03-26]

## Superseded (Tauri/Rust Implementation)

The following items are from the Tauri/Rust prototype and are preserved for reference:

- ~~No central state management for the video player yet~~
- ~~AppImage bundling fails on Linux~~
- ~~TranscriptEditor doesn't yet support real-time word highlighting~~
- ~~FFmpeg commands blocking~~ [FIXED]
- ~~Various Tauri-specific bugs~~ [FIXED]
