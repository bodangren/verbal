# Implementation Plan: Chore - Refactor/Cleanup 2026-03-25 Work

## Scope
Cleanup and tech debt reduction from 2026-03-24 work. Focus on medium-severity issues.

## Phase 1: FFmpeg Async Command Fix [checkpoint: TBC]
> Issue: FFmpeg commands use blocking `std::process::Command` in async context.
> Impact: Can block tokio runtime, causing hangs during video processing.
> Fix: Replace with `tokio::process::Command` in `src-tauri/src/ffmpeg/`.

- [x] Task: Audit FFmpeg command usage for blocking calls
    - [x] Search for `std::process::Command` in ffmpeg module
    - [x] Identify all blocking calls in async functions
- [x] Task: Replace std::process::Command with tokio::process::Command
    - [x] Write Tests: Existing tests cover the functionality
    - [x] Implement: Add async versions (`apply_cuts_async`, `extract_audio_async`, etc.)
    - [x] Implement: Update callers in `commands/mod.rs` and `transcription/orchestrator.rs`
    - [x] Verify: `cargo test` passes (149 tests)
- [x] Task: Measure - Verify Phase 1 complete (tests pass, cargo check clean)

## Phase 2: Minor Fixes [checkpoint: TBC]
- [x] Task: Fix AGENTS.md typo ("USe hte" → "Use the")
    - [x] Verify: No functional change, documentation only
- [x] Task: Fix clippy warning - derive Default for JobStatus
    - [x] Replace manual impl Default with #[derive(Default)]
    - [x] Verify: cargo clippy shows no warnings
- [x] Task: Measure - Verify Phase 2 complete (tests pass)

## Success Criteria
- [x] All FFmpeg commands have async versions using `tokio::process::Command`
- [x] All 149 Rust tests pass
- [x] All 50 frontend tests pass
- [x] `cargo clippy` shows no new warnings
- [x] AGENTS.md typo fixed
