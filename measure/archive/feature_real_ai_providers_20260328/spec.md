# Spec: Feature - Real AI Provider Implementations

## Overview
Replace the stub OpenAI and Google transcription providers with real HTTP client
implementations that call the Whisper API and Google Speech-to-Text API respectively.
Add .env loading so the app can read API keys at startup. Create integration tests
against mock HTTP servers and a smoke test harness for manual verification.

## Functional Requirements
1. **OpenAI Whisper Provider**: Multipart file upload to `POST /v1/audio/transcriptions`
   with `whisper-1` model, returning word-level timestamps via `timestamp_granularities[]`.
2. **Google Speech-to-Text Provider**: REST call to Google's Speech-to-Text API
   using the API key, returning word-level timestamps.
3. **.env Loading**: Load `.env` at app startup using `godotenv` (or equivalent)
   so `OPENAI_API_KEY` / `GOOGLE_API_KEY` are available to `NewProviderFromEnv()`.
4. **Error Handling**: Distinguish auth errors (401), rate limits (429), and
   server errors (5xx) with typed errors and retry with exponential backoff.
5. **Smoke Test**: A standalone test or script that transcribes a short sample
   audio file against both providers (when keys are available).

## Non-Functional Requirements
- No direct SDK imports — plain `net/http` only
- All provider HTTP calls run in goroutines, never blocking the GTK main loop
- Timeouts: 30s for transcription requests
- Test coverage >80% for `internal/ai/`

## Acceptance Criteria
- `OpenAIProvider.Transcribe()` returns real `TranscriptionResult` from Whisper API
- `GoogleProvider.Transcribe()` returns real `TranscriptionResult` from Google API
- `.env` loaded automatically at startup
- Unit tests pass with mock HTTP servers (httptest)
- Smoke test can transcribe a sample WAV file end-to-end
- Existing tests continue to pass

## Out of Scope
- LLM-based analysis / filler word detection (future track)
- Audio extraction from video (GStreamer concern)
- UI changes
