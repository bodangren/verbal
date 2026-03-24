# Tech Debt
- No central state management for the video player yet (using local component state).
- AppImage bundling fails on Linux with "failed to run linuxdeploy" - deb/rpm work fine. [severity: low]
- TranscriptEditor doesn't yet support real-time word highlighting during playback.
- `validate_filename` function in Rust is unused but tested (will be needed for future save operations).
- Transcription is synchronous in `start_transcription` command - should spawn background task for long files. [severity: medium]

# Current Bugs to target

## Webcam doesn't connect! I think this is related to pipewire remote error
