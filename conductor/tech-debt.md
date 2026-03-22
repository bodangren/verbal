# Tech Debt
- No central state management for the video player yet (using local component state).
- AppImage bundling fails on Linux with "failed to run linuxdeploy" - deb/rpm work fine. [severity: low]
- TranscriptEditor doesn't yet support real-time word highlighting during playback.
- `validate_filename` function in Rust is unused but tested (will be needed for Phase 3 FFmpeg cutting).
