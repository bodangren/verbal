# Current Directive: AI Providers Implemented

## Active Directive
**Real AI providers implemented. Ready for next feature.**

## Completed
- [x] Typed AI errors (AuthError, RateLimitError, ServerError)
- [x] .env loading for API keys at startup
- [x] OpenAI Whisper HTTP client with retry
- [x] Google Speech-to-Text HTTP client with retry
- [x] Smoke tests (skip without API keys)
- [x] Integration tests for both providers

## Success Criteria (All Met)
- OpenAI Whisper returns real TranscriptionResult with word timestamps
- Google Speech returns real TranscriptionResult with word timestamps
- .env loaded automatically from ~/.config/verbal/.env, exec dir, and CWD
- Unit tests pass with mock HTTP servers (44 total)
- Smoke tests can transcribe a WAV file end-to-end when keys available

## Timeline
Started: 2026-03-28
Completed: 2026-03-28

## In Progress
- **PlaybackWindow fully integrated into main application** ✅
  - Phase 1: Core sync controller ✅ (98.8% test coverage)
  - Phase 2: Word widgets ✅ (clickable, highlightable labels)
  - Phase 3: GStreamer playback integration ✅ (gtk4paintablesink embedded)
  - Phase 4: Main window split-pane layout ✅ (PlaybackWindow with file open dialog)

## Next Steps
- Add segment export functionality (wire ExportSegments to media.SegmentExporter)
- Settings UI for AI provider configuration
- Recording management / library view
- Database & recording history (SQLite)
- Recording management / library view
- Database & recording history (SQLite)
