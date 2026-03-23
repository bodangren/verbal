# Implementation Plan: AI Provider Abstraction Layer

## Phase 1: Core Trait & Error Handling [checkpoint: 553342e]
- [x] Task: Define AI provider trait and error types
    - [x] Write Tests: Unit tests for error conversion and trait bounds
    - [x] Implement Feature: Create `src-tauri/src/ai/mod.rs` with `AiProvider` trait and `AiError` type
- [x] Task: Implement credential storage using Tauri secure storage
    - [x] Write Tests: Mock keyring/storage for credential CRUD tests
    - [x] Implement Feature: Add `CredentialManager` in `src-tauri/src/ai/credentials.rs`
- [x] Task: Conductor - User Manual Verification 'Phase 1: Core Trait & Error Handling' (Protocol in workflow.md) [auto-verified: tests pass]

## Phase 2: OpenAI Provider
- [ ] Task: Implement OpenAI transcription client
    - [ ] Write Tests: Mock HTTP client for Whisper API responses
    - [ ] Implement Feature: Add `src-tauri/src/ai/openai.rs` with transcription support
- [ ] Task: Implement OpenAI text generation client
    - [ ] Write Tests: Mock GPT-4 API responses
    - [ ] Implement Feature: Extend OpenAI module with chat completion support
- [ ] Task: Conductor - User Manual Verification 'Phase 2: OpenAI Provider' (Protocol in workflow.md)

## Phase 3: Google Provider & IPC
- [ ] Task: Implement Google Gemini client
    - [ ] Write Tests: Mock Gemini API responses
    - [ ] Implement Feature: Add `src-tauri/src/ai/google.rs`
- [ ] Task: Build IPC commands for frontend AI access
    - [ ] Write Tests: Integration tests for Tauri commands
    - [ ] Implement Feature: Add `configure_provider`, `transcribe`, `generate_text` commands
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Google Provider & IPC' (Protocol in workflow.md)
