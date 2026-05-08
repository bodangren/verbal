# Track: Auto-Save and Crash Recovery

## Problem
Verbal currently requires manual save/export. A crash or unexpected shutdown loses all unsaved transcript edits, segment boundaries, and timeline state.

## Goal
Implement automatic background saving of project state (transcript, edit operations, playback position) to SQLite with recovery on next launch.

## Acceptance Criteria
- [ ] Auto-save interval configurable (default: 30 seconds) when project is dirty
- [ ] Save transcript text, word timestamps, edit operations, and playback position
- [ ] Detect unclean shutdown on next launch and offer recovery dialog
- [ ] Recovery restores full edit history (operations are reversible)
- [ ] Auto-save does not block UI (runs in background goroutine)
- [ ] Tests pass (repository + integration tests)
- [ ] Build and vet clean
