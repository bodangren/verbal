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
