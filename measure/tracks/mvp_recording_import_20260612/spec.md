# Specification: MVP Recording & Import

## Overview

This track implements the two ways media enters the Verbal library: recording from hardware and importing an existing file.

## Goals

1. Record video and audio from a webcam and microphone.
2. Import existing video/audio files into the library.
3. Store media files and metadata in a local project directory.
4. Provide a simple, testable media pipeline abstraction.

## Non-Goals

- Real-time transcription during recording.
- Advanced recording settings (resolution, frame rate, codec selection).
- Import from network or removable media.

## Functional Requirements

### FR1: Recording Pipeline
- `internal/media` provides a `Recorder` interface.
- Default implementation uses GStreamer: `v4l2src` for video, `pipewiresrc`/`pulsesrc`/`autoaudiosrc` for audio, muxed to MP4 or MKV.
- Recorder supports `Start`, `Stop`, and `Cancel`.
- Recordings are saved to a configurable project directory with a timestamped filename.

### FR2: Import Pipeline
- `internal/media` provides an `Importer` that copies or references an existing file.
- Supported containers/formats: MP4, MOV, MKV, AVI, WEBM, WAV, MP3, FLAC, OGG.
- Generate a stable `Recording` entry in SQLite with duration and creation time.

### FR3: Library Persistence
- Recording metadata is stored in SQLite via `internal/db`.
- Status field indicates `New`, `Transcribing`, `Transcribed`, or `Error`.

### FR4: UI Integration
- "Record" button in the header bar starts/stops recording.
- "Import" menu action opens a file chooser.
- Library view updates after a successful record or import.

## Acceptance Criteria

- [ ] `Recorder` interface is defined with a fake/mock implementation for tests.
- [ ] Recording produces a playable media file in the project directory.
- [ ] Import copies or references the source file and creates a `Recording` entry.
- [ ] Library view shows the new recording with correct duration and status.
- [ ] Unit tests cover pipeline construction and repository updates.
- [ ] `make check` passes.
