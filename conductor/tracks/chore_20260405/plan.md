# Track: Chore - Refactor/Cleanup 2026-04-05

**Type:** chore  
**Date:** 2026-04-05  
**Status:** Completed  

## Focus
Post-video-sync cleanup, test coverage improvements, and resolving medium-severity tech debt from previous day's work.

## Context
- Video sync feature (Phases 1-5) completed on 2026-04-04
- Current coverage: AI 82.8%, Sync 96.7%, Transcription 68.6%, Media 46.5%, UI 11.7%
- Medium severity tech debt: GStreamer error propagation, SetState return values ignored
- Binary `verbal` file showing as modified (should be ignored per .gitignore)

## Tasks

### Task 1: Fix binary artifact tracking
- [x] Remove `verbal` binary from git tracking
- [x] Verify .gitignore properly excludes build artifacts
- [x] Clean up working directory

### Task 2: Improve GStreamer error propagation
- [x] Replace `fmt.Printf` in bus watchers with callback/error channel pattern
- [x] Add `onError` and `onWarning` callback fields to PlaybackPipeline
- [x] Add tests for error callback registration

### Task 3: Handle SetState return values
- [x] Update `Play()`, `Pause()`, `Stop()`, `Close()` in PlaybackPipeline to return errors
- [x] Check for `gst.StateChangeFailure` on state transitions
- [x] Update tests to handle error returns
- [x] Update doc comment example to show error handling

### Task 4: Increase test coverage
- [x] Add tests for UI error display and formatDuration
- [x] Add tests for playback error callbacks
- [x] Run full test suite and verify all pass

## Acceptance Criteria
- [ ] All tests pass
- [ ] Build succeeds without errors
- [ ] Binary artifacts not tracked in git
- [ ] GStreamer errors properly propagated to UI
- [ ] State transition failures handled gracefully
- [ ] Test coverage improved in UI and media packages
