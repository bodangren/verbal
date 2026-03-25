# Tech Debt

## Go + GTK4 Implementation (Current)

### Medium Severity
- **GStreamer video sink uses separate window** - `autovideosink` opens external window instead of embedding in GTK4. Need `gtk4paintablesink` from `gstreamer1.0-plugins-bad`. [severity: medium]

### Low Severity
- No Go tests for cmd/verbal main package (requires display for GTK). [severity: low]
- Libadwaita integration skipped due to Go 1.24 requirement. [severity: low]

## Resolved

- ~~Recording pipeline uses test sources~~ - Now uses real hardware (v4l2src + pulsesrc) with graceful fallback to test sources. [resolved: 2026-03-26]

## Superseded (Tauri/Rust Implementation)

The following items are from the Tauri/Rust prototype and are preserved for reference:

- ~~No central state management for the video player yet~~
- ~~AppImage bundling fails on Linux~~
- ~~TranscriptEditor doesn't yet support real-time word highlighting~~
- ~~FFmpeg commands blocking~~ [FIXED]
- ~~Various Tauri-specific bugs~~ [FIXED]
