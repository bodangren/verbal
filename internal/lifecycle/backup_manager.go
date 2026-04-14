package lifecycle

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// BackupInfo contains metadata about a backup file.
type BackupInfo struct {
	Path      string
	Size      int64
	CreatedAt time.Time
}

// BackupManager provides database backup and restore functionality.
type BackupManager struct {
	dbPath         string
	backupDir      string
	autoBackup     bool
	retentionCount int
	mu             sync.RWMutex
}

// NewBackupManager creates a new BackupManager instance.
func NewBackupManager(dbPath, backupDir string) *BackupManager {
	return &BackupManager{
		dbPath:         dbPath,
		backupDir:      backupDir,
		autoBackup:     false,
		retentionCount: 10, // Default: keep 10 backups
	}
}

// CreateBackup creates a new backup of the database with a timestamp.
func (bm *BackupManager) CreateBackup() (string, error) {
	bm.mu.Lock()
	defer bm.mu.Unlock()

	// Verify source database exists
	if _, err := os.Stat(bm.dbPath); os.IsNotExist(err) {
		return "", fmt.Errorf("database file does not exist: %s", bm.dbPath)
	}

	// Ensure backup directory exists with restricted permissions
	if err := os.MkdirAll(bm.backupDir, 0700); err != nil {
		return "", fmt.Errorf("create backup directory: %w", err)
	}

	// Generate backup filename with timestamp (including milliseconds for uniqueness)
	// Use underscore instead of dot for Windows compatibility
	now := time.Now()
	timestamp := now.Format("20060102_150405") + fmt.Sprintf("_%03d", now.Nanosecond()/1e6)
	backupName := fmt.Sprintf("verbal_backup_%s.db", timestamp)
	backupPath := filepath.Join(bm.backupDir, backupName)

	// Copy database file
	src, err := os.Open(bm.dbPath)
	if err != nil {
		return "", fmt.Errorf("open database: %w", err)
	}
	defer src.Close()

	dst, err := os.OpenFile(backupPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return "", fmt.Errorf("create backup file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", fmt.Errorf("copy database: %w", err)
	}

	return backupPath, nil
}

// ListBackups returns a list of all backup files, sorted by creation time (newest first).
func (bm *BackupManager) ListBackups() ([]string, error) {
	bm.mu.RLock()
	defer bm.mu.RUnlock()

	// Check if backup directory exists
	if _, err := os.Stat(bm.backupDir); os.IsNotExist(err) {
		return []string{}, nil
	}

	entries, err := os.ReadDir(bm.backupDir)
	if err != nil {
		return nil, fmt.Errorf("read backup directory: %w", err)
	}

	var backups []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, "verbal_backup_") && strings.HasSuffix(name, ".db") {
			backupPath := filepath.Join(bm.backupDir, name)
			backups = append(backups, backupPath)
		}
	}

	// Sort by modification time (newest first)
	sort.Slice(backups, func(i, j int) bool {
		infoI, _ := os.Stat(backups[i])
		infoJ, _ := os.Stat(backups[j])
		if infoI == nil || infoJ == nil {
			return false
		}
		return infoI.ModTime().After(infoJ.ModTime())
	})

	return backups, nil
}

// RestoreBackup restores the database from a backup file.
func (bm *BackupManager) RestoreBackup(backupPath string) error {
	bm.mu.Lock()
	defer bm.mu.Unlock()

	// Verify backup exists
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		return fmt.Errorf("backup file does not exist: %s", backupPath)
	}

	// Ensure destination directory exists with restricted permissions
	dbDir := filepath.Dir(bm.dbPath)
	if err := os.MkdirAll(dbDir, 0700); err != nil {
		return fmt.Errorf("create database directory: %w", err)
	}

	// Copy backup to database location
	src, err := os.Open(backupPath)
	if err != nil {
		return fmt.Errorf("open backup file: %w", err)
	}
	defer src.Close()

	dst, err := os.OpenFile(bm.dbPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("create database file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return fmt.Errorf("restore database: %w", err)
	}

	return nil
}

// RotateBackups removes old backups, keeping only the specified number of most recent ones.
func (bm *BackupManager) RotateBackups(keep int) error {
	if keep < 1 {
		return fmt.Errorf("keep count must be at least 1")
	}

	bm.mu.Lock()
	defer bm.mu.Unlock()

	backups, err := bm.listBackupsUnlocked()
	if err != nil {
		return err
	}

	// If we have more backups than we want to keep, delete the oldest ones
	if len(backups) > keep {
		// backups are already sorted newest first
		toDelete := backups[keep:]
		for _, backup := range toDelete {
			if err := os.Remove(backup); err != nil {
				// Log but don't fail - continue deleting others
				fmt.Fprintf(os.Stderr, "Warning: failed to delete old backup %s: %v\n", backup, err)
			}
		}
	}

	return nil
}

// listBackupsUnlocked returns backups without acquiring the lock (caller must hold lock).
func (bm *BackupManager) listBackupsUnlocked() ([]string, error) {
	if _, err := os.Stat(bm.backupDir); os.IsNotExist(err) {
		return []string{}, nil
	}

	entries, err := os.ReadDir(bm.backupDir)
	if err != nil {
		return nil, fmt.Errorf("read backup directory: %w", err)
	}

	var backups []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, "verbal_backup_") && strings.HasSuffix(name, ".db") {
			backupPath := filepath.Join(bm.backupDir, name)
			backups = append(backups, backupPath)
		}
	}

	// Sort by modification time (newest first)
	sort.Slice(backups, func(i, j int) bool {
		infoI, _ := os.Stat(backups[i])
		infoJ, _ := os.Stat(backups[j])
		if infoI == nil || infoJ == nil {
			return false
		}
		return infoI.ModTime().After(infoJ.ModTime())
	})

	return backups, nil
}

// GetBackupInfo returns metadata about a specific backup.
func (bm *BackupManager) GetBackupInfo(backupPath string) (*BackupInfo, error) {
	info, err := os.Stat(backupPath)
	if err != nil {
		return nil, fmt.Errorf("stat backup file: %w", err)
	}

	return &BackupInfo{
		Path:      backupPath,
		Size:      info.Size(),
		CreatedAt: info.ModTime(),
	}, nil
}

// IsAutoBackupEnabled returns whether automatic backup is enabled.
func (bm *BackupManager) IsAutoBackupEnabled() bool {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	return bm.autoBackup
}

// SetAutoBackupEnabled enables or disables automatic backup.
func (bm *BackupManager) SetAutoBackupEnabled(enabled bool) {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	bm.autoBackup = enabled
}

// GetRetentionCount returns the number of backups to retain during rotation.
func (bm *BackupManager) GetRetentionCount() int {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	return bm.retentionCount
}

// SetRetentionCount sets the number of backups to retain.
func (bm *BackupManager) SetRetentionCount(count int) {
	if count < 1 {
		count = 1
	}
	bm.mu.Lock()
	defer bm.mu.Unlock()
	bm.retentionCount = count
}

// GetBackupDir returns the backup directory path.
func (bm *BackupManager) GetBackupDir() string {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	return bm.backupDir
}

// GetDBPath returns the database path.
func (bm *BackupManager) GetDBPath() string {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	return bm.dbPath
}
