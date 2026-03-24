# Tech Debt
- No central state management for the video player yet (using local component state).
- AppImage bundling fails on Linux with "failed to run linuxdeploy" - deb/rpm work fine. [severity: low]
- TranscriptEditor doesn't yet support real-time word highlighting during playback.
- `validate_filename` function in Rust is unused but tested (will be needed for future save operations).

## FIXED (2026-03-24) — Bugs resolved in bugfix_20260324 track

### ~~BUG-1: `apply_cuts` always errors before FFmpeg runs~~ [FIXED]
Fixed by updating `validate_path_is_within_dir` to handle non-existent files and adding input_path validation.

### ~~BUG-2: `stopRecording` returns empty/stale Blob~~ [FIXED]
Fixed by using `chunksRef` instead of React state for chunk accumulation.

### ~~BUG-3: `save_video` sends video as JSON number array — OOM for real recordings~~ [FIXED]
Fixed by switching to base64 encoding and using `tokio::fs::write` instead of `std::fs::write`.

### ~~BUG-4: Async transcription jobs get stuck in Pending forever~~ [FIXED]
Fixed by rewriting the tokio::spawn block to catch all errors and call `tracker.mark_failed()`.

## Webcam

- **~~Webcam root cause unfixed~~** 2026-03-24T11:23:48.498730Z ERROR crabcamera::commands::capture: Failed to capture frame: Failed to get camera: Failed to create camera: Camera initialization error: Failed to initialize camera: Could not get device property CameraFormat: Failed to Fufill


## Medium Severity (Non-blocking)

- **~~FFmpeg commands use blocking `std::process::Command` in async context~~** [FIXED 2026-03-25]
  Replaced with async versions using `tokio::process::Command`. Callers updated in commands/mod.rs and transcription/orchestrator.rs.

## Low Severity

- **No overlapping segment validation** in `CutList::parse_json` (`src-tauri/src/cut_list/mod.rs`). Add overlap check after sorting. [severity: low]
- **VideoPlayer `togglePlay` doesn't handle async `play()` rejection** (`src/components/VideoPlayer.tsx`). Wrap in try/catch. [severity: low]
- **Test gaps** — VideoPlayer transcript highlight/seek tests and TranscriptEditor onChange test only assert element existence, not behavior. [severity: low]
- **Duplicate types** — `TranscriptWord`/`TranscriptSegment` in test file should import from component. [severity: low]
- **AGENTS.md typo** — "USe hte" → "Use the". [severity: trivial]
