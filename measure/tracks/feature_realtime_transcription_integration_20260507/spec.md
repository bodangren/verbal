# Specification: Real-time Transcription Integration

## Overview

Integrate the real-time transcription streaming interfaces (RealtimeTranscriber, GstTranscriber, StreamingProvider, LiveCaptionWidget, RecordingTranscriber) into the main recording flow. This enables live captioning during recording with the Ctrl+Shift+R shortcut.

## Goals

1. Wire RecordingTranscriber into the recording pipeline
2. Connect LiveCaptionWidget to display streaming captions
3. Add Ctrl+Shift+R keyboard shortcut to start/stop real-time transcription during recording
4. Ensure fallback to file-based transcription if streaming fails

## Technical Approach

- Use the existing `internal/ai/realtime` package interfaces
- Connect LiveCaptionWidget to the RecordingTranscriber's word callback
- Integrate with media.Recording flow for starting/stopping
- Store streaming state in the recording session

## Acceptance Criteria

- [ ] Pressing Ctrl+Shift+R during recording starts real-time transcription
- [ ] Live captions appear in LiveCaptionWidget during recording
- [ ] Pressing Ctrl+Shift+R again stops transcription and finalizes captions
- [ ] If streaming fails, fallback to file-based transcription works
- [ ] All existing tests pass