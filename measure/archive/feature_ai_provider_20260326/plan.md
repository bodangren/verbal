# Plan: Feature - AI Provider Abstraction Layer

## Objective
Create a provider-agnostic abstraction layer for AI transcription services (OpenAI Whisper, Google Speech-to-Text) following the architectural mandate.

## Architecture
```
internal/ai/
├── provider.go       # Interface definition
├── openai.go         # OpenAI Whisper implementation
├── google.go         # Google Speech-to-Text implementation
└── provider_test.go  # Unit tests
```

## Phase 1: Interface Definition [x] Completed
- [x] Define TranscriptionProvider interface
- [x] Define TranscriptionResult struct with word-level timestamps
- [x] Define error types (RateLimitError, AuthError, etc.)
- [x] Add configuration struct for API keys/endpoints

## Phase 2: OpenAI Whisper Implementation [x] Completed
- [x] Implement OpenAI provider using REST API
- [x] Handle Whisper response parsing (word-level timestamps)
- [x] Add retry logic with exponential backoff
- [x] Add tests with mock HTTP server

## Phase 3: Google Speech-to-Text Implementation [x] Completed
- [x] Implement Google provider using REST API
- [x] Handle Google response parsing
- [x] Add credential file support
- [x] Add tests with mock HTTP server

## Phase 4: Factory and Configuration [x] Completed
- [x] Create provider factory function
- [x] Add environment variable configuration
- [x] Add validation for required config
- [x] Integration test skeleton

## Success Criteria
- Clean interface with no direct SDK imports in consumer code
- Both providers return consistent TranscriptionResult
- All tests pass with >80% coverage
- No hardcoded API keys
