# Specification: MP4 File Open Does Not Load Playback

## Problem

During manual QA, launching Verbal opens the app, but selecting an `.mp4` from the file-open dialog returns without loading the selected media into playback. This blocks all downstream manual testing for playback, waveform, transcription, editing, and export.

## Requirements

- Selecting a valid MP4 through the open dialog must load the media into the playback surface.
- The user must receive visible feedback if the selected file cannot be loaded.
- The load path must preserve local-first behavior and use GStreamer for media playback.
- Any database/library synchronization must not block loading an existing file.
- The fix must include focused automated coverage where feasible.

## Acceptance Criteria

- File-open callback passes the selected path into the same playback-loading path used by library item activation, or an equivalent tested path.
- Playback state is updated after a successful load.
- Failed loads are surfaced instead of silently returning.
- Verification includes focused tests plus project-level build/test/smoke checks.
