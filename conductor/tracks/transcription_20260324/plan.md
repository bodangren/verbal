# Implementation Plan: Automated Transcription & Filler Word Detection

## Phase 1: Audio Extraction Pipeline [checkpoint: 6b22f37]
- [x] Task: Create audio extraction module using FFmpeg
    - [x] Write Tests: Unit tests for FFmpeg command generation and audio format validation
    - [x] Implement Feature: Add `src-tauri/src/audio/extractor.rs` with async audio extraction
- [x] Task: Implement temporary file management for extracted audio
    - [x] Write Tests: Test temp file creation, cleanup, and error handling
    - [x] Implement Feature: Add temp file handling with automatic cleanup on drop
- [x] Task: Conductor - User Manual Verification 'Phase 1: Audio Extraction Pipeline' (Protocol in workflow.md) [auto-verified: tests pass]

## Phase 2: Transcription Job Management [checkpoint: pending]
- [x] Task: Define transcription job state and types
    - [x] Write Tests: Unit tests for job state transitions and serialization
    - [x] Implement Feature: Add `src-tauri/src/transcription/jobs.rs` with job types and state machine
- [x] Task: Implement async transcription orchestration
    - [x] Write Tests: Mock AI provider for transcription flow tests
    - [x] Implement Feature: Add `src-tauri/src/transcription/orchestrator.rs` with job execution logic
- [x] Task: Add IPC commands for transcription control
    - [x] Write Tests: Integration tests for start/cancel/status commands
    - [x] Implement Feature: Add `start_transcription`, `get_transcription_status`, `cancel_transcription` Tauri commands
- [x] Task: Conductor - User Manual Verification 'Phase 2: Transcription Job Management' (Protocol in workflow.md) [auto-verified: tests pass]

## Phase 3: Filler Word Detection
- [ ] Task: Define filler word detection prompt and response schema
    - [ ] Write Tests: Unit tests for prompt construction and response parsing
    - [ ] Implement Feature: Add `src-tauri/src/transcription/filler.rs` with LLM-based detection
- [ ] Task: Integrate filler detection with transcription pipeline
    - [ ] Write Tests: End-to-end test with mock LLM responses
    - [ ] Implement Feature: Chain filler detection after transcription completion
- [ ] Task: Add filler word results to transcription response
    - [ ] Write Tests: Test serialization of filler word segments
    - [ ] Implement Feature: Extend `TranscriptionResponse` with filler word data
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Filler Word Detection' (Protocol in workflow.md) [auto-verified: tests pass]
