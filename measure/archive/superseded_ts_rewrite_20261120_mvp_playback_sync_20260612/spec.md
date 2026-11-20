# Specification: MVP Playback & Sync

## Overview

This track implements embedded video/audio playback with a clickable, highlight-synced transcript.

## Goals

1. Play recordings in an embedded GTK preview.
2. Display transcripts as selectable word labels.
3. Highlight the current word as playback advances.
4. Click a word to seek to its start time.

## Non-Goals

- Waveform or timeline visualization (post-MVP).
- Real-time transcript updates during recording.
- Text editing in the transcript view.

## Functional Requirements

### FR1: Playback Pipeline
- `internal/media` provides a `Player` interface.
- Default implementation uses GStreamer `playbin3` or a custom decodebin pipeline.
- Supports `Play`, `Pause`, `Stop`, `Seek`, and position/duration queries.
- Video renders to an embedded GTK widget (`gtk4paintablesink` preferred).

### FR2: Transcript View
- `internal/ui` provides a `TranscriptView` widget.
- Displays words in a flowing layout.
- Each word is a selectable label with start/end metadata.
- Clicking a word seeks the player to the word's start time.

### FR3: Sync Controller
- `internal/sync` provides a `SyncController`.
- Polls player position at 10Hz (configurable).
- Uses binary search on word timestamps to find the current word.
- Highlights the current word via `glib.IdleAdd`.

### FR4: Keyboard Shortcuts
- Space toggles play/pause.
- Left/Right arrow seeks by 5 seconds.
- Click-to-seek on any word.

## Acceptance Criteria

- [ ] `Player` interface has a fake implementation for tests.
- [ ] `SyncController` correctly identifies the current word via binary search.
- [ ] Clicking a word calls `Player.Seek` with the word's start time.
- [ ] Highlight updates are dispatched to the GTK main thread.
- [ ] UI tests verify transcript rendering with mocked player.
- [ ] `make check` passes.
