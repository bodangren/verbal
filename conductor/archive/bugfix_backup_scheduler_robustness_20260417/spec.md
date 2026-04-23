# Track: Bugfix - BackupScheduler Robustness Improvements

**Created:** 2026-04-17  
**Status:** In Progress  
**Priority:** Medium

## Problem Statement

The BackupScheduler has three medium-severity robustness issues that need to be addressed:

1. **Panicking callback kills scheduler goroutine** - The `onBackupComplete` callback is invoked without panic recovery, meaning a panic in user code silently takes down the scheduler goroutine.

2. **Errors logged to stderr, not app logger** - Rotation errors are written to `os.Stderr` instead of being routed through the application's logger, and some errors are silently swallowed.

3. **Wake-from-sleep behavior untested** - The 1-minute ticker with `time.Now().After(nextBackup)` handles sleep/wake scenarios but lacks explicit test coverage.

## Goals

1. Add panic recovery around all callback invocations to prevent scheduler crashes
2. Route all errors through the application logger with appropriate log levels
3. Add explicit test coverage for sleep/wake scenarios
4. Surface backup failures via error callbacks or channels

## Success Criteria

- [ ] All callback invocations have panic recovery with logging
- [ ] No direct `fmt.Fprintf(os.Stderr, ...)` calls in backup/lifecycle packages
- [ ] Logger interface integrated into BackupScheduler and BackupManager
- [ ] Test coverage for missed backup slot detection
- [ ] All existing tests continue to pass
- [ ] Test coverage maintained at >80%

## Related Tech Debt Items

From tech-debt.md:
- **Panicking onBackupComplete callback kills scheduler goroutine** [severity: medium]
- **BackupScheduler errors logged to stderr, not app logger** [severity: medium]
- **BackupScheduler tick granularity and wake-from-sleep** [severity: medium]

## Architecture Notes

The BackupScheduler (`internal/lifecycle/backup_scheduler.go`) runs a goroutine that:
1. Ticks every minute via `time.Ticker`
2. Checks if `time.Now().After(nextBackup)` to trigger backups
3. Invokes `onBackupComplete` callback on completion/error
4. Calls `BackupManager.RotateBackups()` which writes to stderr on errors

The fix needs to:
1. Add `defer recover()` wrappers around callback invocations
2. Add a logger interface parameter to constructors
3. Replace stderr writes with logger calls
4. Add wake-time detection and logging for missed slots
