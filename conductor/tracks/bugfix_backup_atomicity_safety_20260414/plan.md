# Implementation Plan: Backup Atomicity and Safety Fixes

## Overview

This plan implements fixes for high-severity backup safety issues in `BackupManager`. All changes follow TDD methodology: write tests first (red), implement the fix (green), then refactor.

---

## Phase 1: Foundation - Test Infrastructure and Permission Fixes

**Objective:** Establish test coverage baseline and fix permission issues (medium severity).

### Task 1.1: Write tests for backup file/directory permissions [ ]

**TDD Approach:**
- [ ] Write test: `TestCreateBackup_CreatesDirectoryWithRestrictedPermissions`
  - Verify backup dir is created with `0700` permissions
  - Use `os.Stat()` to check mode bits
- [ ] Write test: `TestCreateBackup_CreatesFileWithRestrictedPermissions`
  - Verify backup file is created with `0600` permissions
  - Use `os.Stat()` to check mode bits
- [ ] Run tests - should FAIL (current implementation uses `0755`/`0666`)

### Task 1.2: Implement permission fixes [ ]

- [ ] Change `os.MkdirAll(bm.backupDir, 0755)` to `os.MkdirAll(bm.backupDir, 0700)`
- [ ] Use `os.OpenFile()` with `0600` permissions for backup file creation
- [ ] Run tests - should PASS
- [ ] Commit: `git commit -m "fix(backup): use restrictive permissions (0700/0600) for backup files"`

### Task 1.3: Write tests for timestamp format fix [ ]

**TDD Approach:**
- [ ] Write test: `TestCreateBackup_UsesUnderscoreTimestampFormat`
  - Verify new backups use `20060102_150405_000` format
  - Assert filename does not contain dots except for `.db` extension
- [ ] Write test: `TestListBackups_HandlesBothTimestampFormats`
  - Verify old format backups (`20060102_150405.000`) are still listed
  - Verify new format backups are listed
- [ ] Run tests - should FAIL (current uses dot format)

### Task 1.4: Implement timestamp format fix [ ]

- [ ] Change timestamp format from `20060102_150405.000` to `20060102_150405_000`
- [ ] Update `ListBackups()` regex/parsing to handle both formats
- [ ] Run tests - should PASS
- [ ] Commit: `git commit -m "fix(backup): use underscore in timestamp format for Windows compatibility"`

---

## Phase 2: Atomic Backup Creation (HIGH SEVERITY)

**Objective:** Fix `CreateBackup()` to safely backup live SQLite database.

### Task 2.1: Design backup safety interface [ ]

- [ ] Define `DBConnectionManager` interface:
  ```go
  type DBConnectionManager interface {
      GetDB() *sql.DB
      Close() error
      IsConnected() bool
  }
  ```
- [ ] Define backup options struct:
  ```go
  type BackupOptions struct {
      Timeout time.Duration  // Max time to wait for exclusive lock
  }
  ```

### Task 2.2: Write tests for atomic backup creation [ ]

**TDD Approach:**
- [ ] Write test: `TestCreateBackup_WaitsForTransactionCompletion`
  - Simulate concurrent write transaction
  - Verify backup waits for transaction to complete
  - Use goroutines and channels for synchronization
- [ ] Write test: `TestCreateBackup_BeginImmediateBlocksWriters`
  - Verify `BEGIN IMMEDIATE` is executed before copy
  - Mock `database/sql` to verify transaction start
- [ ] Write test: `TestCreateBackup_CreatesConsistentSnapshot`
  - Write data during backup, verify backup has consistent state
  - Use checksum or row count verification
- [ ] Run tests - should FAIL (current implementation doesn't use transactions)

### Task 2.3: Implement atomic backup with BEGIN IMMEDIATE [ ]

- [ ] Add `database/sql` import to backup_manager.go
- [ ] Add `db *sql.DB` field to `BackupManager` struct
- [ ] Modify `NewBackupManager()` to accept `*sql.DB` parameter
- [ ] Update `CreateBackup()` to:
  1. Start `BEGIN IMMEDIATE` transaction (obtains exclusive lock)
  2. Perform file copy while holding transaction
  3. Commit transaction
  4. Handle timeout and cancellation
- [ ] Add `defer` for transaction rollback on error
- [ ] Run tests - should PASS
- [ ] Commit: `git commit -m "fix(backup): use BEGIN IMMEDIATE transaction for atomic backup creation"`

### Task 2.4: Add error handling and edge case tests [ ]

- [ ] Write test: `TestCreateBackup_HandlesDatabaseLocked`
  - Verify graceful error when DB is locked beyond timeout
- [ ] Write test: `TestCreateBackup_HandlesConcurrentBackups`
  - Verify two simultaneous backups don't corrupt each other
- [ ] Run all new tests - should PASS

---

## Phase 3: Atomic Restore with Rollback (HIGH SEVERITY)

**Objective:** Fix `RestoreBackup()` to be atomic with pre-restore snapshot.

### Task 3.1: Design restore safety mechanism [ ]

- [ ] Define restore options:
  ```go
  type RestoreOptions struct {
      CreateSnapshot bool      // Whether to create pre-restore backup
      SnapshotDir    string    // Where to store snapshot (default: backupDir)
  }
  ```
- [ ] Define callback interface for DB connection management:
  ```go
  type RestoreCallbacks struct {
      BeforeRestore func() error  // Called before restore (should close DB)
      AfterRestore  func() error  // Called after restore (should reopen DB)
  }
  ```

### Task 3.2: Write tests for atomic restore [ ]

**TDD Approach:**
- [ ] Write test: `TestRestoreBackup_CreatesPreRestoreSnapshot`
  - Verify snapshot is created before any destructive operation
  - Snapshot filename should include `.pre-restore` suffix
- [ ] Write test: `TestRestoreBackup_UsesAtomicFileReplacement`
  - Verify temp file + rename pattern is used
  - Verify original DB is not modified until rename
- [ ] Write test: `TestRestoreBackup_FsyncBeforeRename`
  - Verify `fsync` is called on temp file before rename
  - Mock or verify file descriptor sync
- [ ] Write test: `TestRestoreBackup_LeavesOriginalOnCopyFailure`
  - Simulate disk-full during copy
  - Verify original DB is unchanged
  - Verify temp file is cleaned up
- [ ] Run tests - should FAIL (current implementation overwrites directly)

### Task 3.3: Implement atomic restore with temp file pattern [ ]

- [ ] Modify `RestoreBackup()` signature to accept `RestoreOptions` and `RestoreCallbacks`
- [ ] Implement pre-restore snapshot creation:
  ```go
  snapshotPath := fmt.Sprintf("%s.pre-restore.%s", bm.dbPath, timestamp)
  // Copy current DB to snapshot
  ```
- [ ] Implement atomic replacement:
  1. Call `BeforeRestore` callback to release DB connection
  2. Copy backup to `dbPath.tmp`
  3. Call `fsync` on the temp file
  4. Rename `dbPath.tmp` to `dbPath` (atomic)
  5. Call `AfterRestore` callback to reopen DB
- [ ] Add cleanup of temp file on error
- [ ] Run tests - should PASS
- [ ] Commit: `git commit -m "fix(backup): implement atomic restore with temp file + fsync + rename"`

### Task 3.4: Implement automatic rollback on failure [ ]

- [ ] Add rollback logic in error path:
  ```go
  if err != nil {
      // Restore from snapshot
      os.Rename(snapshotPath, bm.dbPath)
  }
  ```
- [ ] Write test: `TestRestoreBackup_RollsBackOnFailure`
  - Simulate failure mid-restore
  - Verify snapshot is restored to original location
  - Verify error is returned to caller
- [ ] Write test: `TestRestoreBackup_CleansUpSnapshotOnSuccess`
  - Verify `.pre-restore` file is deleted after successful restore
- [ ] Run tests - should PASS
- [ ] Commit: `git commit -m "feat(backup): add automatic rollback from snapshot on restore failure"`

### Task 3.5: Add DB connection verification [ ]

- [ ] Write test: `TestRestoreBackup_VerifiesDBConnectionReleased`
  - Verify restore fails gracefully if DB connection is still held
- [ ] Implement connection check in `BeforeRestore` callback handling
- [ ] Run tests - should PASS

---

## Phase 4: Integration and Refactoring

**Objective:** Integrate changes with existing code and refactor for clarity.

### Task 4.1: Update BackupManager constructor calls [ ]

- [ ] Find all call sites of `NewBackupManager()`
- [ ] Update to pass `*sql.DB` parameter
- [ ] Update `main.go` to pass database connection
- [ ] Verify build passes: `go build ./...`

### Task 4.2: Update BackupSettingsDialog integration [ ]

- [ ] Modify dialog to pass restore callbacks
- [ ] Test manual backup/restore through UI
- [ ] Verify error messages are displayed to user

### Task 4.3: Refactor for code quality [ ]

- [ ] Extract file permission constants:
  ```go
  const (
      backupDirPerm  = 0700
      backupFilePerm = 0600
  )
  ```
- [ ] Extract timestamp format constant:
  ```go
  const backupTimestampFormat = "20060102_150405_000"
  const backupTimestampFormatLegacy = "20060102_150405.000" // for parsing
  ```
- [ ] Create helper function for atomic file write:
  ```go
  func atomicWriteFile(path string, r io.Reader, perm os.FileMode) error
  ```
- [ ] Refactor common backup file listing logic (DRY between `ListBackups` and `listBackupsUnlocked`)
- [ ] Run linter: `go vet ./internal/lifecycle/...`
- [ ] Commit: `git commit -m "refactor(backup): extract constants and helper functions"`

### Task 4.4: Add comprehensive documentation [ ]

- [ ] Add package-level doc comment explaining backup safety guarantees
- [ ] Document `CreateBackup` transaction behavior
- [ ] Document `RestoreBackup` atomicity guarantees
- [ ] Add example usage in test files

---

## Phase 5: Test Coverage and Quality Assurance

**Objective:** Achieve >80% test coverage and verify all fixes.

### Task 5.1: Expand test coverage [ ]

- [ ] Write test: `TestBackupManager_Integration_FullBackupRestoreCycle`
  - End-to-end test: create DB → insert data → backup → modify → restore → verify
- [ ] Write test: `TestCreateBackup_ProgressiveFileGrowth`
  - Verify backup handles growing database files
- [ ] Write test: `TestRestoreBackup_InvalidBackupFile`
  - Verify graceful handling of corrupted backup files
- [ ] Write test: `TestRotateBackups_PreservesPermissions`
  - Verify rotation doesn't change file permissions
- [ ] Run coverage report: `go test -cover ./internal/lifecycle/...`
- [ ] Verify >80% coverage

### Task 5.2: Add stress tests [ ]

- [ ] Write test: `TestBackupManager_Stress_ConcurrentBackups`
  - 10+ concurrent backup operations
  - Verify no corruption or crashes
- [ ] Write test: `TestBackupManager_Stress_RapidBackupRestore`
  - Rapid alternation of backup and restore
  - Verify database consistency throughout

### Task 5.3: Run full test suite [ ]

- [ ] Run all tests: `go test ./... -v`
- [ ] Run race detector: `go test -race ./internal/lifecycle/...`
- [ ] Verify no regressions in other packages

### Task 5.4: Manual verification [ ]

- [ ] Build application: `go build ./cmd/verbal`
- [ ] Launch application and create test recording
- [ ] Trigger manual backup via File → Backup menu
- [ ] Verify backup file created with correct permissions
- [ ] Verify backup filename uses underscore format
- [ ] Trigger restore from backup
- [ ] Verify restore completes successfully
- [ ] Verify recording data is intact after restore

---

## Phase 6: Documentation and Tech Debt Resolution

**Objective:** Update documentation and mark tech debt as resolved.

### Task 6.1: Update tech-debt.md [ ]

- [ ] Mark backup safety issues as resolved with references to commits
- [ ] Add notes about any deferred items or new discoveries

### Task 6.2: Update lessons-learned.md [ ]

- [ ] Document SQLite backup best practices learned
- [ ] Document atomic file replacement pattern
- [ ] Note importance of fsync before rename for durability

### Task 6.3: Update track status [ ]

- [ ] Update `conductor/tracks.md` with completion status
- [ ] Update `metadata.json` with actual task count
- [ ] Archive track if all issues resolved

---

## Task Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1 | 4 | Permission fixes and timestamp format (medium severity) |
| 2 | 4 | Atomic backup creation with BEGIN IMMEDIATE (high severity) |
| 3 | 5 | Atomic restore with rollback (high severity) |
| 4 | 4 | Integration, refactoring, and code quality |
| 5 | 4 | Test coverage, stress tests, and verification |
| 6 | 3 | Documentation and tech debt resolution |
| **Total** | **24** | |

## Quality Gates

- [ ] All new code has >80% test coverage
- [ ] All tests pass (`go test ./...`)
- [ ] Race detector passes (`go test -race`)
- [ ] Build succeeds (`go build ./...`)
- [ ] Manual UI verification completed
- [ ] Tech debt items marked as resolved
