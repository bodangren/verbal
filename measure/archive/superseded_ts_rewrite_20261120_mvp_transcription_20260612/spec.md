# Specification: MVP Transcription

## Overview

This track implements provider-agnostic transcription with word-level timestamp storage. Only OpenAI Whisper and Google Speech-to-Text are in scope for MVP.

## Goals

1. Define a provider-agnostic transcription interface.
2. Implement OpenAI Whisper HTTP client.
3. Implement Google Speech-to-Text HTTP client.
4. Extract audio from media files using GStreamer.
5. Store word-level timestamps in SQLite.

## Non-Goals

- Local whisper.cpp transcription (post-MVP).
- Real-time streaming transcription (post-MVP).
- Speaker diarization.
- Multiple languages per recording.

## Functional Requirements

### FR1: Provider Interface
- `internal/ai` defines `Provider` with `Transcribe(ctx, audioPath, language) (Transcript, error)`.
- `Transcript` contains a slice of `Word` from `internal/domain`.
- No OpenAI or Google SDK imports outside `internal/ai`.

### FR2: Audio Extraction
- `internal/transcription` extracts mono 16kHz PCM audio via GStreamer before sending to the provider.
- Audio extraction is cancellable via context.
- Errors are surfaced with clear messages (e.g., "GStreamer failed to decode input file").

### FR3: OpenAI Provider
- Sends FLAC or WAV audio to the OpenAI Whisper API.
- Requests `verbose_json` with word-level timestamps.
- Parses response into `domain.Word` slice.
- Handles API key and network errors.

### FR4: Google Provider
- Sends audio to Google Speech-to-Text v1 API.
- Requests word-level timestamps.
- Parses response into `domain.Word` slice.
- Handles API key and network errors.

### FR5: Settings
- Settings UI stores the selected provider and API key (or path to key file).
- Key is never logged or exposed in error messages.

### FR6: Persistence
- Completed transcripts are stored as JSON in the `transcripts` table.
- Recording status updates to `Transcribed` or `Error`.

## Acceptance Criteria

- [ ] Provider interface is defined with a fake implementation for tests.
- [ ] OpenAI provider returns correct word timestamps from a mocked API response.
- [ ] Google provider returns correct word timestamps from a mocked API response.
- [ ] Audio extraction is tested with a real fixture or a mocked GStreamer runner.
- [ ] Transcript persistence round-trips through SQLite.
- [ ] `make check` passes.
