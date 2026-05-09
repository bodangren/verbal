# Plan: Auto-Save and Crash Recovery

## Phase 1: Auto-Save Repository Layer (TDD)
- [x] Write tests for AutoSaveRepository
- [x] Add auto_save table (projectId, transcriptJSON, operationsJSON, playbackPos, savedAt)
- [x] Implement SaveAutoSave and LoadAutoSave methods
- [x] Tests pass

## Phase 2: Background Auto-Save Service
- [x] Write tests for AutoSaveService (interval, dirty detection)
- [x] Implement background goroutine with glib.IdleAdd for UI updates
- [x] Wire into PlaybackWindow lifecycle
- [x] Tests pass

## Phase 3: Crash Recovery UI
- [x] Detect unclean shutdown flag in app startup
- [x] Show recovery dialog with timestamp and project name
- [x] Restore transcript, operations, and playback position
- [x] Manual verification

## Phase 4: Verification
- [x] Full test suite pass
- [x] Build and vet clean
- [x] Update tech-debt.md
- [ ] Commit and push
