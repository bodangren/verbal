package lifecycle

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
