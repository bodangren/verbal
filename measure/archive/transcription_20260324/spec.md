# Specification: Automated Transcription & Filler Word Detection

## Overview
Build an asynchronous transcription pipeline that processes media files through the AI provider abstraction layer, extracts word-level timestamps, and uses LLM intelligence to identify filler words for removal suggestions.

## Functional Requirements

### FR1: Media File Transcription
- Accept media file paths (video/audio) from frontend
- Extract audio from media files using FFmpeg
- Send audio to configured AI provider (OpenAI Whisper or Gemini) via abstraction layer
- Return word-level timestamps synced to original media

### FR2: Filler Word Detection
- Process transcribed text through LLM for filler word identification
- Identify common filler patterns: "um", "uh", "ah", "like", "you know", "so", "basically"
- Return list of filler word segments with timestamps for UI highlighting

### FR3: Transcription State Management
- Track transcription job status (pending, processing, complete, failed)
- Support cancellation of in-progress transcription jobs
- Cache completed transcriptions to avoid re-processing

## Non-Functional Requirements

### NFR1: Performance
- Audio extraction should use efficient FFmpeg settings (no re-encoding)
- Transcription jobs should run asynchronously without blocking UI
- Support for files up to 2 hours in length

### NFR2: Reliability
- Handle network failures during transcription with retry logic
- Preserve partial transcription results on failure
- Validate audio format before processing

## Acceptance Criteria
- [ ] User can request transcription of a media file through frontend
- [ ] Transcription returns word-level timestamps accurate to within 100ms
- [ ] Filler words are detected and returned with timestamps
- [ ] Transcription status is visible in UI during processing
- [ ] Failed transcriptions provide meaningful error messages

## Out of Scope
- Real-time streaming transcription (future enhancement)
- Multi-speaker diarization
- Language auto-detection (will use configured language)
