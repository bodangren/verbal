# Plan: Feature - Real AI Provider Implementations

## Phase 1: Foundation — Error Types & .env Loading
- [x] Task: Define typed AI errors (AuthError, RateLimitError, ServerError) [commit: edceab5]
    - [x] Write tests for error type checking and unwrapping
    - [x] Implement error types in `internal/ai/errors.go`
- [x] Task: Add .env loading at startup [commit: pending]
    - [x] Write test that verifies env vars are loaded from .env file
    - [x] Add `github.com/joho/godotenv` dependency and load in `cmd/verbal/main.go`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Foundation' (Protocol in workflow.md)

## Phase 2: OpenAI Whisper Provider
- [ ] Task: Implement OpenAI Whisper HTTP client
    - [ ] Write tests with `httptest` mock server: success, auth error, rate limit, server error
    - [ ] Implement multipart upload to `POST https://api.openai.com/v1/audio/transcriptions`
    - [ ] Parse response into `TranscriptionResult` with word-level timestamps
- [ ] Task: Add retry with exponential backoff for transient errors
    - [ ] Write tests for retry behavior (429 → retry → success)
    - [ ] Implement retry logic with max 3 attempts and jitter
- [ ] Task: Conductor - User Manual Verification 'Phase 2: OpenAI Whisper Provider' (Protocol in workflow.md)

## Phase 3: Google Speech-to-Text Provider
- [ ] Task: Implement Google Speech-to-Text HTTP client
    - [ ] Write tests with `httptest` mock server: success, auth error, server error
    - [ ] Implement REST call to Google Speech-to-Text API with API key auth
    - [ ] Parse response into `TranscriptionResult` with word-level timestamps
- [ ] Task: Add retry with exponential backoff for transient errors
    - [ ] Write tests for retry behavior
    - [ ] Implement retry logic (reuse or mirror OpenAI approach)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Google Speech-to-Text Provider' (Protocol in workflow.md)

## Phase 4: Smoke Test & Integration
- [ ] Task: Create sample audio test fixture
    - [ ] Generate a short (~3s) WAV file for testing
- [ ] Task: Write smoke tests that hit real APIs (skipped without env keys)
    - [ ] `TestSmokeOpenAITranscription` — real Whisper call, skip if no `OPENAI_API_KEY`
    - [ ] `TestSmokeGoogleTranscription` — real Google call, skip if no `GOOGLE_API_KEY`
- [ ] Task: Verify end-to-end flow through transcription.Service
    - [ ] Write integration test wiring `Service` → real provider → result validation
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Smoke Test & Integration' (Protocol in workflow.md)
