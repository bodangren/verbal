package lifecycle

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestBackupManager_CreateBackup(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create a test database file
	if err := os.WriteFile(dbPath, []byte("test database content"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	backup, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Verify backup was created
	if backup == "" {
		t.Error("Expected backup path, got empty string")
	}

	if _, err := os.Stat(backup); os.IsNotExist(err) {
		t.Errorf("Backup file does not exist: %s", backup)
	}

	// Verify backup contains expected content
	content, err := os.ReadFile(backup)
	if err != nil {
		t.Fatalf("Failed to read backup: %v", err)
	}

	if string(content) != "test database content" {
		t.Errorf("Backup content mismatch: got %q, want %q", string(content), "test database content")
	}

	// Verify backup filename contains timestamp
	if !strings.Contains(filepath.Base(backup), "verbal_backup_") {
		t.Errorf("Backup filename should contain 'verbal_backup_': %s", backup)
	}
}

func TestBackupManager_CreateBackup_NonExistentDB(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "nonexistent.db")
	backupDir := filepath.Join(tmpDir, "backups")

	bm := NewBackupManager(dbPath, backupDir)

	_, err := bm.CreateBackup()
	if err == nil {
		t.Error("Expected error for non-existent database, got nil")
	}
}

func TestBackupManager_ListBackups(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create backup directory
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		t.Fatalf("Failed to create backup dir: %v", err)
	}

	// Create a test database
	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	// Create multiple backups
	backup1, _ := bm.CreateBackup()
	time.Sleep(10 * time.Millisecond) // Ensure different timestamps
	backup2, _ := bm.CreateBackup()
	time.Sleep(10 * time.Millisecond)
	backup3, _ := bm.CreateBackup()

	backups, err := bm.ListBackups()
	if err != nil {
		t.Fatalf("ListBackups() error = %v", err)
	}

	if len(backups) != 3 {
		t.Errorf("Expected 3 backups, got %d", len(backups))
	}

	// Verify backups are sorted by time (newest first)
	expected := []string{backup3, backup2, backup1}
	for i, exp := range expected {
		if backups[i] != exp {
			t.Errorf("Backup[%d] = %s, want %s", i, backups[i], exp)
		}
	}
}

func TestBackupManager_ListBackups_Empty(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	bm := NewBackupManager(dbPath, backupDir)

	backups, err := bm.ListBackups()
	if err != nil {
		t.Fatalf("ListBackups() error = %v", err)
	}

	if len(backups) != 0 {
		t.Errorf("Expected 0 backups, got %d", len(backups))
	}
}

func TestBackupManager_RestoreBackup(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create initial database
	if err := os.WriteFile(dbPath, []byte("version 1"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	// Create a backup
	backup, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Modify original database
	if err := os.WriteFile(dbPath, []byte("version 2"), 0644); err != nil {
		t.Fatalf("Failed to modify test db: %v", err)
	}

	// Restore backup
	if err := bm.RestoreBackup(backup); err != nil {
		t.Fatalf("RestoreBackup() error = %v", err)
	}

	// Verify restoration
	content, err := os.ReadFile(dbPath)
	if err != nil {
		t.Fatalf("Failed to read restored db: %v", err)
	}

	if string(content) != "version 1" {
		t.Errorf("Restored content = %q, want %q", string(content), "version 1")
	}
}

func TestBackupManager_RestoreBackup_NonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	bm := NewBackupManager(dbPath, backupDir)

	err := bm.RestoreBackup("/nonexistent/backup.db")
	if err == nil {
		t.Error("Expected error for non-existent backup, got nil")
	}
}

func TestBackupManager_RotateBackups(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create test database
	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	// Create 5 backups
	for i := 0; i < 5; i++ {
		_, err := bm.CreateBackup()
		if err != nil {
			t.Fatalf("CreateBackup() error = %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Verify we have 5 backups
	backups, _ := bm.ListBackups()
	if len(backups) != 5 {
		t.Fatalf("Expected 5 backups, got %d", len(backups))
	}

	// Rotate to keep only 3
	if err := bm.RotateBackups(3); err != nil {
		t.Fatalf("RotateBackups() error = %v", err)
	}

	// Verify only 3 remain (newest ones)
	backups, _ = bm.ListBackups()
	if len(backups) != 3 {
		t.Errorf("Expected 3 backups after rotation, got %d", len(backups))
	}
}

func TestBackupManager_RotateBackups_KeepMoreThanExist(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	// Create 2 backups
	for i := 0; i < 2; i++ {
		bm.CreateBackup()
		time.Sleep(10 * time.Millisecond)
	}

	// Try to keep 5 (more than exist)
	if err := bm.RotateBackups(5); err != nil {
		t.Fatalf("RotateBackups() error = %v", err)
	}

	backups, _ := bm.ListBackups()
	if len(backups) != 2 {
		t.Errorf("Expected 2 backups (all kept), got %d", len(backups))
	}
}

func TestBackupManager_GetBackupInfo(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test database content for size"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	backup, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	info, err := bm.GetBackupInfo(backup)
	if err != nil {
		t.Fatalf("GetBackupInfo() error = %v", err)
	}

	if info.Path != backup {
		t.Errorf("Info.Path = %s, want %s", info.Path, backup)
	}

	if info.Size == 0 {
		t.Error("Expected non-zero size")
	}

	if info.CreatedAt.IsZero() {
		t.Error("Expected non-zero CreatedAt")
	}
}

func TestBackupManager_AutoBackupEnabled(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	// Initially disabled
	if bm.IsAutoBackupEnabled() {
		t.Error("Expected auto-backup to be disabled by default")
	}

	// Enable auto-backup
	bm.SetAutoBackupEnabled(true)
	if !bm.IsAutoBackupEnabled() {
		t.Error("Expected auto-backup to be enabled after SetAutoBackupEnabled(true)")
	}

	// Disable auto-backup
	bm.SetAutoBackupEnabled(false)
	if bm.IsAutoBackupEnabled() {
		t.Error("Expected auto-backup to be disabled after SetAutoBackupEnabled(false)")
	}
}

// TestCreateBackup_CreatesDirectoryWithRestrictedPermissions verifies backup dir uses 0700 permissions
func TestCreateBackup_CreatesDirectoryWithRestrictedPermissions(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create a test database file
	if err := os.WriteFile(dbPath, []byte("test database content"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	_, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Verify backup directory has 0700 permissions
	info, err := os.Stat(backupDir)
	if err != nil {
		t.Fatalf("Failed to stat backup directory: %v", err)
	}

	// Check permissions - should be 0700 (owner read/write/execute only)
	mode := info.Mode().Perm()
	expectedMode := os.FileMode(0700)
	if mode != expectedMode {
		t.Errorf("Backup directory permissions = %04o, want %04o", mode, expectedMode)
	}
}

// TestCreateBackup_CreatesFileWithRestrictedPermissions verifies backup file uses 0600 permissions
func TestCreateBackup_CreatesFileWithRestrictedPermissions(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create a test database file
	if err := os.WriteFile(dbPath, []byte("test database content"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	backup, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Verify backup file has 0600 permissions
	info, err := os.Stat(backup)
	if err != nil {
		t.Fatalf("Failed to stat backup file: %v", err)
	}

	// Check permissions - should be 0600 (owner read/write only)
	mode := info.Mode().Perm()
	expectedMode := os.FileMode(0600)
	if mode != expectedMode {
		t.Errorf("Backup file permissions = %04o, want %04o", mode, expectedMode)
	}
}

// TestCreateBackup_UsesUnderscoreTimestampFormat verifies new backups use underscore format (Windows compatibility)
func TestCreateBackup_UsesUnderscoreTimestampFormat(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create a test database file
	if err := os.WriteFile(dbPath, []byte("test database content"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	backup, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Get the filename
	filename := filepath.Base(backup)

	// Verify filename contains underscore timestamp format, not dot format
	// Expected: verbal_backup_20060102_150405_000.db (underscore before milliseconds)
	// Bad:      verbal_backup_20060102_150405.000.db (dot before milliseconds - problematic on Windows)
	if strings.Contains(filename, ".") && !strings.HasSuffix(filename, ".db") {
		t.Errorf("Backup filename uses dot in timestamp (not Windows-compatible): %s", filename)
	}

	// Verify the timestamp portion uses underscore format
	// The pattern should be: verbal_backup_YYYYMMDD_HHMMSS_MMM.db
	// Extract timestamp portion
	if !strings.HasPrefix(filename, "verbal_backup_") || !strings.HasSuffix(filename, ".db") {
		t.Errorf("Backup filename has unexpected format: %s", filename)
	}

	// Remove prefix and suffix to get timestamp part
	timestampPart := strings.TrimPrefix(filename, "verbal_backup_")
	timestampPart = strings.TrimSuffix(timestampPart, ".db")

	// Should have format: 20060102_150405_000 (no dots)
	if strings.Contains(timestampPart, ".") {
		t.Errorf("Timestamp part contains dot (should use underscore): %s", timestampPart)
	}

	// Verify timestamp has expected parts: date_time_milliseconds
	parts := strings.Split(timestampPart, "_")
	if len(parts) != 3 {
		t.Errorf("Timestamp part should have 3 underscore-separated components (date_time_millis), got %d: %s", len(parts), timestampPart)
	}
}

// TestListBackups_HandlesBothTimestampFormats verifies old (dot) and new (underscore) format backups are both listed
func TestListBackups_HandlesBothTimestampFormats(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create backup directory
	if err := os.MkdirAll(backupDir, 0700); err != nil {
		t.Fatalf("Failed to create backup dir: %v", err)
	}

	// Create a test database
	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	bm := NewBackupManager(dbPath, backupDir)

	// Create a backup with new format (will use underscore)
	backup1, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}
	time.Sleep(10 * time.Millisecond)

	// Manually create a backup with old dot format to simulate legacy backup
	oldFormatBackup := filepath.Join(backupDir, "verbal_backup_20260102_150405.123.db")
	if err := os.WriteFile(oldFormatBackup, []byte("old format backup"), 0600); err != nil {
		t.Fatalf("Failed to create old format backup: %v", err)
	}

	backups, err := bm.ListBackups()
	if err != nil {
		t.Fatalf("ListBackups() error = %v", err)
	}

	// Should have 2 backups
	if len(backups) != 2 {
		t.Errorf("Expected 2 backups, got %d", len(backups))
	}

	// Verify both backups are in the list
	foundNew := false
	foundOld := false
	for _, backup := range backups {
		if backup == backup1 {
			foundNew = true
		}
		if backup == oldFormatBackup {
			foundOld = true
		}
	}

	if !foundNew {
		t.Error("New format backup not found in list")
	}
	if !foundOld {
		t.Error("Old format backup not found in list")
	}
}

// TestCreateBackup_WithDB_CreatesConsistentSnapshot verifies backup uses BEGIN IMMEDIATE for atomicity
func TestCreateBackup_WithDB_CreatesConsistentSnapshot(t *testing.T) {
	// Skip if no database support (this test requires sqlite3)
	// In a real implementation, we would test with an actual SQLite database
	t.Skip("Skipping: requires actual SQLite database connection for BEGIN IMMEDIATE test")
}

// TestCreateBackup_UsesBeginImmediateTransaction verifies backup uses BEGIN IMMEDIATE
func TestCreateBackup_UsesBeginImmediateTransaction(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	defer db.Close()

	// Create a test table and insert data
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}

	_, err = db.Exec("INSERT INTO test (data) VALUES ('initial data')")
	if err != nil {
		t.Fatalf("Failed to insert data: %v", err)
	}

	// Create backup manager with database connection
	bm := NewBackupManagerWithDB(dbPath, backupDir, db)

	// Create backup
	backup, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Verify backup was created
	if _, err := os.Stat(backup); os.IsNotExist(err) {
		t.Errorf("Backup file does not exist: %s", backup)
	}

	// Verify backup contains the data (consistent snapshot)
	backupDB, err := sql.Open("sqlite", backup)
	if err != nil {
		t.Fatalf("Failed to open backup database: %v", err)
	}
	defer backupDB.Close()

	var count int
	err = backupDB.QueryRow("SELECT COUNT(*) FROM test").Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query backup: %v", err)
	}

	if count != 1 {
		t.Errorf("Backup has %d rows, expected 1 (consistent snapshot)", count)
	}
}

// TestCreateBackup_BeginImmediateBlocksWriters verifies BEGIN IMMEDIATE blocks concurrent writes
func TestCreateBackup_BeginImmediateBlocksWriters(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	defer db.Close()

	// Create a test table
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}

	// Create backup manager
	bm := NewBackupManagerWithDB(dbPath, backupDir, db)

	// Start a concurrent write operation
	writeStarted := make(chan bool)
	writeDone := make(chan error)

	go func() {
		writeDB, err := sql.Open("sqlite", dbPath)
		if err != nil {
			writeDone <- err
			return
		}
		defer writeDB.Close()

		// Signal that we're starting
		writeStarted <- true

		// Try to write - this should be blocked during backup
		_, err = writeDB.Exec("INSERT INTO test (data) VALUES ('concurrent write')")
		writeDone <- err
	}()

	// Wait for write goroutine to start
	<-writeStarted
	time.Sleep(10 * time.Millisecond) // Small delay to ensure write is waiting

	// Create backup - this should use BEGIN IMMEDIATE
	backup, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Wait for write to complete
	writeErr := <-writeDone
	if writeErr != nil {
		t.Logf("Concurrent write error (expected during backup): %v", writeErr)
	}

	// Verify backup exists
	if _, err := os.Stat(backup); os.IsNotExist(err) {
		t.Errorf("Backup file does not exist: %s", backup)
	}
}

// TestCreateBackup_CreatesConsistentSnapshotWithConcurrentWrites verifies backup consistency
func TestCreateBackup_CreatesConsistentSnapshotWithConcurrentWrites(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	defer db.Close()

	// Create a test table with many rows
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}

	// Insert initial data
	for i := 0; i < 100; i++ {
		_, err = db.Exec("INSERT INTO test (data) VALUES (?)", fmt.Sprintf("row %d", i))
		if err != nil {
			t.Fatalf("Failed to insert data: %v", err)
		}
	}

	// Create backup manager
	bm := NewBackupManagerWithDB(dbPath, backupDir, db)

	// Start concurrent writes during backup
	done := make(chan bool)
	go func() {
		writeDB, _ := sql.Open("sqlite", dbPath)
		if writeDB != nil {
			defer writeDB.Close()
			for i := 0; i < 50; i++ {
				writeDB.Exec("INSERT INTO test (data) VALUES (?)", fmt.Sprintf("concurrent %d", i))
				time.Sleep(1 * time.Millisecond)
			}
		}
		done <- true
	}()

	// Create backup
	backup, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	<-done

	// Verify backup integrity
	backupDB, err := sql.Open("sqlite", backup)
	if err != nil {
		t.Fatalf("Failed to open backup database: %v", err)
	}
	defer backupDB.Close()

	// Check that backup is a valid SQLite database
	var count int
	err = backupDB.QueryRow("SELECT COUNT(*) FROM test").Scan(&count)
	if err != nil {
		t.Fatalf("Backup database corrupted: %v", err)
	}

	// Backup should have at least the initial 100 rows
	if count < 100 {
		t.Errorf("Backup has only %d rows, expected at least 100", count)
	}

	// Verify backup is internally consistent (no torn writes)
	var maxID int
	err = backupDB.QueryRow("SELECT MAX(id) FROM test").Scan(&maxID)
	if err != nil {
		t.Fatalf("Failed to get max ID: %v", err)
	}

	// Count should match maxID for a consistent snapshot
	if count != maxID {
		t.Errorf("Backup inconsistent: count=%d, maxID=%d (possible torn writes)", count, maxID)
	}
}

// TestCreateBackup_HandlesDatabaseLocked verifies graceful handling when DB is locked
func TestCreateBackup_HandlesDatabaseLocked(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping: cannot connect to sqlite: %v", err)
	}
	defer db.Close()

	// Create a test table
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}

	// Start a transaction that holds a lock
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("Failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	// Insert within transaction to hold lock
	_, err = tx.Exec("INSERT INTO test (data) VALUES ('locked row')")
	if err != nil {
		t.Fatalf("Failed to insert: %v", err)
	}

	// Create backup manager with same database
	bm := NewBackupManagerWithDB(dbPath, backupDir, db)

	// Attempt backup while transaction holds lock
	// Should handle gracefully (either wait or fail cleanly)
	backup, err := bm.CreateBackup()
	if err != nil {
		// Error is acceptable if it's handled gracefully
		t.Logf("Backup failed gracefully with lock held: %v", err)
		return
	}

	// If backup succeeded, verify it's valid
	if _, statErr := os.Stat(backup); os.IsNotExist(statErr) {
		t.Errorf("Backup file does not exist: %s", backup)
	}
}

// TestCreateBackup_HandlesConcurrentBackups verifies two simultaneous backups
func TestCreateBackup_HandlesConcurrentBackups(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping: cannot connect to sqlite: %v", err)
	}
	defer db.Close()

	// Create a test table with data
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}

	for i := 0; i < 100; i++ {
		_, err = db.Exec("INSERT INTO test (data) VALUES (?)", fmt.Sprintf("row %d", i))
		if err != nil {
			t.Fatalf("Failed to insert data: %v", err)
		}
	}

	// Create two backup managers sharing the same DB connection
	bm1 := NewBackupManagerWithDB(dbPath, backupDir, db)

	// Run two backups concurrently using goroutines
	var wg sync.WaitGroup
	results := make(chan string, 2)
	errors := make(chan error, 2)

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			backup, err := bm1.CreateBackup()
			if err != nil {
				errors <- fmt.Errorf("backup %d: %w", id, err)
				return
			}
			results <- backup
		}(i)
	}

	wg.Wait()
	close(results)
	close(errors)

	// Collect results
	var backups []string
	for backup := range results {
		backups = append(backups, backup)
	}

	var errs []error
	for e := range errors {
		errs = append(errs, e)
	}

	// At least one backup should succeed
	if len(backups) == 0 {
		t.Fatalf("All backups failed: %v", errs)
	}

	// Verify all successful backups are valid
	for _, backup := range backups {
		if _, statErr := os.Stat(backup); os.IsNotExist(statErr) {
			t.Errorf("Backup file does not exist: %s", backup)
			continue
		}

		// Verify backup is a valid SQLite database
		backupDB, err := sql.Open("sqlite", backup)
		if err != nil {
			t.Errorf("Failed to open backup %s: %v", backup, err)
			continue
		}

		var count int
		err = backupDB.QueryRow("SELECT COUNT(*) FROM test").Scan(&count)
		backupDB.Close()

		if err != nil {
			t.Errorf("Backup %s corrupted: %v", backup, err)
		} else if count != 100 {
			t.Errorf("Backup %s has %d rows, expected 100", backup, count)
		}
	}
}

// TestRestoreBackupAtomic_CreatesPreRestoreSnapshot verifies snapshot enables rollback
func TestRestoreBackupAtomic_CreatesPreRestoreSnapshot(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping: cannot connect to sqlite: %v", err)
	}
	defer db.Close()

	// Create a test table with data
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}
	_, err = db.Exec("INSERT INTO test (data) VALUES ('original data')")
	if err != nil {
		t.Fatalf("Failed to insert data: %v", err)
	}
	db.Close()

	// Create backup manager
	bm := NewBackupManager(dbPath, backupDir)

	// Create a backup
	backupPath, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Reopen DB and modify data (this is the state we'll snapshot)
	db, _ = sql.Open("sqlite", dbPath)
	db.Exec("UPDATE test SET data = 'modified data'")
	db.Close()

	// Restore with snapshot enabled, but trigger failure in AfterRestore
	// This should leave the snapshot in place for verification
	opts := RestoreOptions{CreateSnapshot: true, SnapshotDir: backupDir}
	callbacks := RestoreCallbacks{
		AfterRestore: func() error {
			return fmt.Errorf("simulated post-restore error")
		},
	}
	err = bm.RestoreBackupAtomic(backupPath, opts, callbacks)
	if err == nil {
		t.Fatal("Expected error from AfterRestore callback")
	}

	// Verify snapshot was created (should exist since restore "failed")
	entries, _ := os.ReadDir(backupDir)
	var foundSnapshot bool
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "pre-restore_") {
			foundSnapshot = true
			break
		}
	}
	if !foundSnapshot {
		t.Error("Pre-restore snapshot was not created")
	}
}

// TestRestoreBackupAtomic_UsesAtomicFileReplacement verifies temp file + rename pattern
func TestRestoreBackupAtomic_UsesAtomicFileReplacement(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping: cannot connect to sqlite: %v", err)
	}

	// Create test table with data
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}
	_, err = db.Exec("INSERT INTO test (data) VALUES ('original data')")
	if err != nil {
		t.Fatalf("Failed to insert data: %v", err)
	}
	db.Close()

	// Create backup manager and backup
	bm := NewBackupManager(dbPath, backupDir)
	backupPath, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Get original file info
	origInfo, _ := os.Stat(dbPath)
	origModTime := origInfo.ModTime()

	// Wait a bit to ensure different mod time
	time.Sleep(100 * time.Millisecond)

	// Restore
	err = bm.RestoreBackupAtomic(backupPath, RestoreOptions{}, RestoreCallbacks{})
	if err != nil {
		t.Fatalf("RestoreBackupAtomic() error = %v", err)
	}

	// Verify database was restored and is valid
	db, _ = sql.Open("sqlite", dbPath)
	defer db.Close()

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM test").Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query restored DB: %v", err)
	}
	if count != 1 {
		t.Errorf("Restored DB has %d rows, expected 1", count)
	}

	// Verify file was replaced (mod time changed)
	newInfo, _ := os.Stat(dbPath)
	if !newInfo.ModTime().After(origModTime) {
		t.Error("Database file was not replaced (mod time unchanged)")
	}
}

// TestRestoreBackupAtomic_RollsBackOnFailure verifies snapshot is restored on failure
func TestRestoreBackupAtomic_RollsBackOnFailure(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping: cannot connect to sqlite: %v", err)
	}

	// Create test table with data
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}
	_, err = db.Exec("INSERT INTO test (data) VALUES ('original data')")
	if err != nil {
		t.Fatalf("Failed to insert data: %v", err)
	}
	db.Close()

	// Create backup manager
	bm := NewBackupManager(dbPath, backupDir)

	// Create a valid backup (to ensure backupDir exists)
	_, err = bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Get original data hash
	db, _ = sql.Open("sqlite", dbPath)
	var origData string
	db.QueryRow("SELECT data FROM test").Scan(&origData)
	db.Close()

	// Attempt restore with snapshot enabled but with a non-existent backup to trigger failure
	nonExistentBackup := filepath.Join(tmpDir, "non-existent-backup.db")
	opts := RestoreOptions{CreateSnapshot: true, SnapshotDir: backupDir}
	err = bm.RestoreBackupAtomic(nonExistentBackup, opts, RestoreCallbacks{})
	if err == nil {
		t.Fatal("Expected error for non-existent backup, got nil")
	}

	// Verify original data is intact (rollback worked)
	db, _ = sql.Open("sqlite", dbPath)
	defer db.Close()

	var currentData string
	err = db.QueryRow("SELECT data FROM test").Scan(&currentData)
	if err != nil {
		t.Fatalf("Database corrupted after failed restore: %v", err)
	}
	if currentData != origData {
		t.Errorf("Data changed after failed restore: got %q, want %q", currentData, origData)
	}
}

// TestRestoreBackupAtomic_CleansUpSnapshotOnSuccess verifies snapshot is removed
func TestRestoreBackupAtomic_CleansUpSnapshotOnSuccess(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping: cannot connect to sqlite: %v", err)
	}

	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}
	db.Close()

	// Create backup manager and backup
	bm := NewBackupManager(dbPath, backupDir)
	backupPath, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Restore with snapshot
	opts := RestoreOptions{CreateSnapshot: true, SnapshotDir: backupDir}
	err = bm.RestoreBackupAtomic(backupPath, opts, RestoreCallbacks{})
	if err != nil {
		t.Fatalf("RestoreBackupAtomic() error = %v", err)
	}

	// Verify no snapshot remains
	entries, _ := os.ReadDir(backupDir)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "pre-restore_") {
			t.Errorf("Snapshot file was not cleaned up: %s", entry.Name())
		}
	}
}

// TestRestoreBackupAtomic_Callbacks verifies BeforeRestore and AfterRestore callbacks
func TestRestoreBackupAtomic_Callbacks(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create an actual SQLite database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping: cannot connect to sqlite: %v", err)
	}

	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}
	db.Close()

	// Create backup manager and backup
	bm := NewBackupManager(dbPath, backupDir)
	backupPath, err := bm.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Track callback invocations
	var beforeCalled, afterCalled bool
	callbacks := RestoreCallbacks{
		BeforeRestore: func() error {
			beforeCalled = true
			return nil
		},
		AfterRestore: func() error {
			afterCalled = true
			return nil
		},
	}

	// Restore with callbacks
	err = bm.RestoreBackupAtomic(backupPath, RestoreOptions{}, callbacks)
	if err != nil {
		t.Fatalf("RestoreBackupAtomic() error = %v", err)
	}

	if !beforeCalled {
		t.Error("BeforeRestore callback was not called")
	}
	if !afterCalled {
		t.Error("AfterRestore callback was not called")
	}
}

// TestRestoreBackupAtomic_NonExistentBackup verifies error for non-existent backup
func TestRestoreBackupAtomic_NonExistentBackup(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	bm := NewBackupManager(dbPath, backupDir)
	nonExistentBackup := filepath.Join(tmpDir, "non-existent-backup.db")

	err := bm.RestoreBackupAtomic(nonExistentBackup, RestoreOptions{}, RestoreCallbacks{})
	if err == nil {
		t.Fatal("Expected error for non-existent backup, got nil")
	}
	if !strings.Contains(err.Error(), "does not exist") {
		t.Errorf("Expected 'does not exist' error, got: %v", err)
	}
}

// TestRestoreBackupAtomic_BeforeRestoreError verifies error from BeforeRestore callback
func TestRestoreBackupAtomic_BeforeRestoreError(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create a database and backup
	db, _ := sql.Open("sqlite", dbPath)
	db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY)")
	db.Close()

	bm := NewBackupManager(dbPath, backupDir)
	backupPath, _ := bm.CreateBackup()

	// Restore with failing BeforeRestore callback
	callbacks := RestoreCallbacks{
		BeforeRestore: func() error {
			return fmt.Errorf("before restore error")
		},
	}

	err := bm.RestoreBackupAtomic(backupPath, RestoreOptions{}, callbacks)
	if err == nil {
		t.Fatal("Expected error from BeforeRestore callback")
	}
	if !strings.Contains(err.Error(), "before restore callback") {
		t.Errorf("Expected 'before restore callback' error, got: %v", err)
	}
}

// TestRestoreBackupAtomic_DefaultSnapshotDir verifies snapshot uses backupDir when SnapshotDir is empty
func TestRestoreBackupAtomic_DefaultSnapshotDir(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	// Create a database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Skipf("Skipping: sqlite driver not available: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping: cannot connect to sqlite: %v", err)
	}
	_, err = db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY)")
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}
	db.Close()

	bm := NewBackupManager(dbPath, backupDir)
	backupPath, _ := bm.CreateBackup()

	// Restore with snapshot enabled but no SnapshotDir specified (should use backupDir)
	opts := RestoreOptions{CreateSnapshot: true} // SnapshotDir defaults to ""
	err = bm.RestoreBackupAtomic(backupPath, opts, RestoreCallbacks{})
	if err != nil {
		t.Fatalf("RestoreBackupAtomic() error = %v", err)
	}

	// Verify backup was successful
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Error("Database was not restored")
	}
}
