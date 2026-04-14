# Specification: Backup Atomicity and Safety Fixes

## Overview

This track addresses critical safety issues in the `BackupManager` implementation that was created as part of the "Recording Data Lifecycle Enhancements" feature. The current implementation has two **HIGH SEVERITY** issues that can result in corrupt backups and data loss during restore operations.

## Background

The backup system was implemented in `internal/lifecycle/backup_manager.go` as part of Phase 5 of the Recording Data Lifecycle track. During post-implementation review (2026-04-13), several safety issues were identified that violate SQLite best practices and could lead to data corruption.

## Issues Addressed

### 1. HIGH SEVERITY: Raw File Copy on Live SQLite Database

**File:** `internal/lifecycle/backup_manager.go:61-75`

**Problem:**
The `CreateBackup()` method opens the SQLite database file directly and performs an `io.Copy()` while the application holds an active database connection. If a write operation is in progress (mid-transaction), this can result in a torn or corrupt backup that appears valid but contains inconsistent data.

**Current Implementation:**
```go
src, err := os.Open(bm.dbPath)
// ...
if _, err := io.Copy(dst, src); err != nil {
    return "", fmt.Errorf("copy database: %w", err)
}
```

**Solution:**
Replace raw file copy with SQLite's online backup API or `VACUUM INTO` command. At minimum, wrap the operation in:
1. `BEGIN IMMEDIATE` transaction to ensure exclusive access
2. Copy the database file
3. `COMMIT` to release the lock

**Acceptance Criteria:**
- [ ] Backups are created atomically without risk of torn writes
- [ ] Concurrent database operations do not corrupt backup files
- [ ] Backup creation waits for any in-progress writes to complete
- [ ] All existing backup tests continue to pass

### 2. HIGH SEVERITY: Non-Atomic Restore with No Rollback

**File:** `internal/lifecycle/backup_manager.go:121-154`

**Problem:**
The `RestoreBackup()` method overwrites the live database file directly via `io.Copy()`. If the copy fails mid-operation (disk full, power loss, process crash), the user is left with a truncated database and no recovery path. The original data is destroyed before the new data is fully written.

**Current Implementation:**
```go
dst, err := os.Create(bm.dbPath)  // Truncates existing DB immediately!
// ...
if _, err := io.Copy(dst, src); err != nil {
    return fmt.Errorf("restore database: %w", err)  // Original DB gone!
}
```

**Solution:**
Implement atomic file replacement:
1. Verify the application has released its database connection
2. Create a snapshot of the current database (`.pre-restore` backup)
3. Copy to a temporary file (`dbPath.tmp`)
4. Call `fsync` on the temporary file to ensure durability
5. Atomically rename `dbPath.tmp` to `dbPath`
6. On failure, restore from the snapshot

**Acceptance Criteria:**
- [ ] Restore operations are atomic (all-or-nothing)
- [ ] Failed restores leave the original database intact
- [ ] Pre-restore snapshot is created before any destructive operation
- [ ] Snapshot is cleaned up after successful restore
- [ ] Snapshot is used for automatic rollback on failure

### 3. MEDIUM SEVERITY: Backup File/Directory Permissions Too Permissive

**File:** `internal/lifecycle/backup_manager.go:51,67,143`

**Problem:**
The backup directory is created with `0755` permissions (world-readable), and backup files inherit the default `0666` umask (world-writable). Since backups contain sensitive transcription data and potentially private recordings, this is a security risk.

**Current Implementation:**
```go
if err := os.MkdirAll(bm.backupDir, 0755); err != nil {
dst, err := os.Create(backupPath)  // Default 0666
```

**Solution:**
- Use `0700` (owner-only) for backup directories
- Use `0600` (owner-read/write only) for backup files

**Acceptance Criteria:**
- [ ] Backup directories created with `0700` permissions
- [ ] Backup files created with `0600` permissions
- [ ] Existing backup permissions are not modified (only new files)

### 4. MEDIUM SEVERITY: Backup Timestamp Format Contains Dot

**File:** `internal/lifecycle/backup_manager.go:56`

**Problem:**
The backup filename format uses `20060102_150405.000` which includes a dot before the millisecond component. This can cause issues on Windows systems where dots in filenames may be interpreted as file extensions or cause parsing problems with certain tools.

**Current Implementation:**
```go
timestamp := time.Now().Format("20060102_150405.000")
// Results in: verbal_backup_20260414_143022.123.db
```

**Solution:**
Replace the dot separator with an underscore:
```go
timestamp := time.Now().Format("20060102_150405_000")
// Results in: verbal_backup_20260414_143022_123.db
```

**Acceptance Criteria:**
- [ ] Backup filenames use `20060102_150405_000` format
- [ ] `ListBackups()` correctly identifies both old and new format filenames
- [ ] Existing backups with old format remain accessible

## Technical Constraints

### SQLite Backup Approaches

The Go standard library does not include SQLite bindings. We have two options for safe backup:

1. **SQLite Online Backup API** (via `database/sql` + driver):
   - Requires CGO (if using `mattn/go-sqlite3`)
   - Uses `sqlite3_backup_init()` for hot backup
   - Most reliable for concurrent access

2. **VACUUM INTO** (SQL command):
   - Available in SQLite 3.27.0+
   - Creates a consistent snapshot without locking the main DB
   - Can be executed through `database/sql`

3. **BEGIN IMMEDIATE + Copy** (fallback):
   - Works with any SQLite setup
   - Blocks writers during backup
   - Simplest implementation

**Decision:** Use approach #3 (BEGIN IMMEDIATE + Copy) for maximum compatibility, but structure the code to allow easy migration to approach #2 in the future.

### Database Connection Handling

For `RestoreBackup()`, the application **MUST** release its database connection before attempting restore. The `BackupManager` should:

1. Accept a callback function that releases the DB connection
2. Call the callback before restore
3. Return an error if the callback fails or connection is still held

This requires coordination with the caller (main application) to properly close and reopen the database.

## Non-Functional Requirements

- **Safety First:** All operations must be recoverable from failures
- **Backward Compatibility:** Existing backups remain valid and accessible
- **Test Coverage:** Target >80% test coverage for all modified code
- **TDD Approach:** Write tests first (red), then implementation (green), then refactor
- **Performance:** Backup operations should complete within 2x the time of a raw file copy
- **Logging:** All backup/restore operations log to the application logger (not stderr)

## Acceptance Criteria (Summary)

- [ ] `CreateBackup()` uses atomic SQLite-safe approach (BEGIN IMMEDIATE + Copy)
- [ ] `RestoreBackup()` uses atomic file replacement (temp + fsync + rename)
- [ ] `RestoreBackup()` creates pre-restore snapshot for rollback
- [ ] Restore releases database connection before destructive operations
- [ ] Backup directory permissions set to `0700`
- [ ] Backup file permissions set to `0600`
- [ ] Backup timestamp format uses underscore separator
- [ ] All existing tests pass
- [ ] New tests achieve >80% coverage
- [ ] All tech debt items from 2026-04-13 review are marked as resolved

## Out of Scope

- Backup encryption at rest
- Backup compression
- Cloud backup integration
- Incremental/differential backups
- Backup integrity verification (checksums)
- Cross-platform backup compatibility testing
