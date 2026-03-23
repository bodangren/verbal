# Current Directive: Automated Transcription & Filler Word Detection

## Active Directive
**Build an asynchronous transcription pipeline that processes media files through the AI provider abstraction layer, extracts word-level timestamps, and uses LLM intelligence to identify filler words.**

## Scope
- **Audio Extraction**: FFmpeg-based audio extraction from media files
- **Transcription Jobs**: Async job management with status tracking
- **Filler Detection**: LLM-based filler word identification with timestamps
- **IPC Commands**: Frontend commands for transcription control

## Success Criteria
- User can request transcription of a media file through frontend
- Transcription returns word-level timestamps accurate to within 100ms
- Filler words are detected and returned with timestamps
- Transcription status is visible in UI during processing

## Timeline
Started: 2026-03-24
Target Completion: 2026-03-27
