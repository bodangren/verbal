# Plan: Auto-Save and Crash Recovery

## Phase 1: Auto-Save Repository Layer (TDD)
- [ ] Write tests for AutoSaveRepository
- [ ] Add auto_save table (projectId, transcriptJSON, operationsJSON, playbackPos, savedAt)
- [ ] Implement SaveAutoSave and LoadAutoSave methods
- [ ] Tests pass

## Phase 2: Background Auto-Save Service
- [ ] Write tests for AutoSaveService (interval, dirty detection)
- [ ] Implement background goroutine with glib.IdleAdd for UI updates
- [ ] Wire into PlaybackWindow lifecycle
- [ ] Tests pass

## Phase 3: Crash Recovery UI
- [ ] Detect unclean shutdown flag in app startup
- [ ] Show recovery dialog with timestamp and project name
- [ ] Restore transcript, operations, and playback position
- [ ] Manual verification

## Phase 4: Verification
- [ ] Full test suite pass
- [ ] Build and vet clean
- [ ] Update tech-debt.md
- [ ] Commit and push
