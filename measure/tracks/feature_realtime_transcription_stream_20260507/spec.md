# Spec: Real-time Transcription Stream

**Track:** feature_realtime_transcription_stream_20260507  
**Created:** 2026-05-07  
**Focus:** Transition from file-based transcription to real-time GStreamer app-sink streaming for live captioning during recording.

---

## Context

Verbal currently supports file-based transcription (load a file, transcribe it). This track implements real-time transcription during recording sessions using GStreamer's app-sink pattern to stream audio data to the transcription provider.

## Functionality Specification

### Core Features

1. **RealtimeTranscriber package** (`internal/ai/realtime/`)
   - Interface: `Transcriber` with `Start()`, `Stop()`, `OnWordCallback(callback func(word WordData))` methods
   - Uses GStreamer pipeline with `appsink` to receive audio buffers
   - Streams buffer data to transcription provider (OpenAI, Google, or Local)
   - Handles partial results and finalization
   - Thread-safe state management with goroutines

2. **GStreamer Pipeline Integration**
   - Pipeline: `pulsesrc ! queue ! appsink name=transcriber_sink`
   - Audio format: S16LE, 16kHz, mono (matching Whisper requirements)
   - Buffer handling with timestamp preservation
   - Proper element state management (play -> pause -> null)

3. **Recording Session Integration**
   - Add `StartRealtimeTranscription()` method to `media.Recording`
   - Wire into existing recording flow
   - Display live captions during recording
   - Commit transcription on session stop

4. **Live Caption UI**
   - `LiveCaptionWidget` - GTK widget showing real-time transcription
   - Word-by-word appearance as recognized
   - Confidence indicator
   - Dismiss/minimize capability

### User Interactions

1. User clicks "Record" → Recording starts → Real-time transcription begins
2. Words appear in LiveCaptionWidget as they're recognized
3. User clicks "Stop" → Recording stops → Full transcription saved
4. Live caption widget can be minimized during recording, restored on playback

### Data Handling

- Audio buffers streamed to provider in chunks (5-second segments)
- Partial results accumulated until segment finalization
- Final transcription stored in SQLite via existing transcription pathway
- Real-time caption state is ephemeral (not persisted)

### Edge Cases

1. Provider becomes unavailable mid-recording → Continue recording, show warning, fallback to post-recording transcription
2. Audio device changes during recording → Handle gracefully with error message
3. Very long recordings (>1 hour) → Chunk-based processing prevents memory issues
4. No network for cloud providers → Fallback to local transcription if available

## Acceptance Criteria

1. Recording with real-time transcription starts without errors
2. Words appear in LiveCaptionWidget within 2 seconds of being spoken
3. Stopping recording commits full transcription to database
4. Fallback works correctly when provider is unavailable
5. All existing tests pass
6. Build succeeds without CGo errors