# Track: Chore - Refactor/Cleanup 2026-04-05

**Type:** chore  
**Date:** 2026-04-05  
**Status:** In Progress  

## Focus
Post-video-sync cleanup, test coverage improvements, and resolving medium-severity tech debt from previous day's work.

## Context
- Video sync feature (Phases 1-5) completed on 2026-04-04
- Current coverage: AI 82.8%, Sync 96.7%, Transcription 68.6%, Media 46.5%, UI 11.7%
- Medium severity tech debt: GStreamer error propagation, SetState return values ignored
- Binary `verbal` file showing as modified (should be ignored per .gitignore)

## Tasks

### Task 1: Fix binary artifact tracking
- [ ] Remove `verbal` binary from git tracking
- [ ] Verify .gitignore properly excludes build artifacts
- [ ] Clean up working directory

### Task 2: Improve GStreamer error propagation
- [ ] Replace `fmt.Printf` in bus watchers with callback/error channel pattern
- [ ] Surface pipeline errors to UI with user-friendly messages
- [ ] Add tests for error propagation

### Task 3: Handle SetState return values
- [ ] Update `Play()`, `Pause()`, `Stop()`, `Close()` in PlaybackPipeline to check return values
- [ ] Add error handling for failed state transitions
- [ ] Add tests for state transition failures

### Task 4: Increase test coverage
- [ ] Add tests for UI components (target: 25%+)
- [ ] Add tests for media package (target: 55%+)
- [ ] Run full test suite and verify all pass

## Acceptance Criteria
- [ ] All tests pass
- [ ] Build succeeds without errors
- [ ] Binary artifacts not tracked in git
- [ ] GStreamer errors properly propagated to UI
- [ ] State transition failures handled gracefully
- [ ] Test coverage improved in UI and media packages
