# Plan: Feature - Real AI Provider Implementations

## Phase 1: Foundation — Error Types & .env Loading [checkpoint: 795b098]
- [x] Task: Define typed AI errors (AuthError, RateLimitError, ServerError) [commit: edceab5]
    - [x] Write tests for error type checking and unwrapping
    - [x] Implement error types in `internal/ai/errors.go`
- [x] Task: Add .env loading at startup [commit: 3537b29]
    - [x] Write test that verifies env vars are loaded from .env file
    - [x] Add `github.com/joho/godotenv` dependency and load in `cmd/verbal/main.go`
- [ ] Task: Measure - User Manual Verification 'Phase 1: Foundation' (Protocol in workflow.md)

## Phase 2: OpenAI Whisper Provider [checkpoint: 02dcf6e]
- [x] Task: Implement OpenAI Whisper HTTP client [commit: 16f5833]
    - [x] Write tests with `httptest` mock server: success, auth error, rate limit, server error
    - [x] Implement multipart upload to `POST https://api.openai.com/v1/audio/transcriptions`
    - [x] Parse response into `TranscriptionResult` with word-level timestamps
- [x] Task: Add retry with exponential backoff for transient errors [commit: 973282e]
    - [x] Write tests for retry behavior (429 → retry → success)
    - [x] Implement retry logic with max 3 attempts and jitter
- [ ] Task: Measure - User Manual Verification 'Phase 2: OpenAI Whisper Provider' (Protocol in workflow.md)

## Phase 3: Google Speech-to-Text Provider [checkpoint: f8e66aa]
- [x] Task: Implement Google Speech-to-Text HTTP client [commit: 947ba1f]
    - [x] Write tests with `httptest` mock server: success, auth error, server error
    - [x] Implement REST call to Google Speech-to-Text API with API key auth
    - [x] Parse response into `TranscriptionResult` with word-level timestamps
- [x] Task: Add retry with exponential backoff for transient errors [commit: 947ba1f]
    - [x] Write tests for retry behavior
    - [x] Implement retry logic (reuse or mirror OpenAI approach)
- [ ] Task: Measure - User Manual Verification 'Phase 3: Google Speech-to-Text Provider' (Protocol in workflow.md)

## Phase 4: Smoke Test & Integration [checkpoint: 32a1ce2]
- [x] Task: Create sample audio test fixture [commit: 4271f70]
    - [x] Generate a short (~1s) WAV file for testing
- [x] Task: Write smoke tests that hit real APIs (skipped without env keys) [commit: 4271f70]
    - [x] `TestSmokeOpenAITranscription` — real Whisper call, skip if no `OPENAI_API_KEY`
    - [x] `TestSmokeGoogleTranscription` — real Google call, skip if no `GOOGLE_API_KEY`
- [x] Task: Verify end-to-end flow through transcription.Service [commit: 4271f70]
    - [x] Write integration test wiring `Service` → real provider → result validation
- [ ] Task: Measure - User Manual Verification 'Phase 4: Smoke Test & Integration' (Protocol in workflow.md)
