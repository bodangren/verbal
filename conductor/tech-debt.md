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

## Webcam — Root Cause Unfixed

- **Webcam root cause unfixed** — `fix_webcam_20260324` Phase 2 was marked complete but NO config changes were made. `src-tauri/capabilities/default.json` still only has `core:default` + `opener:default`. WebKitGTK on Linux likely needs `enable-media-stream` or PipeWire portal config. See updated plan.md in track. [severity: high]

## Medium Severity (Non-blocking)

- **~~`save_video` uses sync `std::fs::write`~~** [FIXED 2026-03-24]
- **~~`apply_cuts` only validates `output_path` for traversal, not `input_path`~~** [FIXED 2026-03-24]
- **FFmpeg commands use blocking `std::process::Command`** in async context (`src-tauri/src/ffmpeg/mod.rs`, `src-tauri/src/ffmpeg/extractor.rs`). Replace with `tokio::process::Command`. [severity: medium]

## Low Severity

- **No overlapping segment validation** in `CutList::parse_json` (`src-tauri/src/cut_list/mod.rs`). Add overlap check after sorting. [severity: low]
- **VideoPlayer `togglePlay` doesn't handle async `play()` rejection** (`src/components/VideoPlayer.tsx`). Wrap in try/catch. [severity: low]
- **Test gaps** — VideoPlayer transcript highlight/seek tests and TranscriptEditor onChange test only assert element existence, not behavior. [severity: low]
- **Duplicate types** — `TranscriptWord`/`TranscriptSegment` in test file should import from component. [severity: low]
- **AGENTS.md typo** — "USe hte" → "Use the". [severity: trivial]
