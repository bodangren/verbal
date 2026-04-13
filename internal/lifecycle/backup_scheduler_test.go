package lifecycle

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestBackupScheduler_New(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir)
	scheduler := NewBackupScheduler(manager)

	if scheduler == nil {
		t.Fatal("Expected scheduler instance, got nil")
	}

	if scheduler.manager != manager {
		t.Error("Scheduler manager mismatch")
	}

	if scheduler.running {
		t.Error("Expected scheduler to not be running initially")
	}
}

func TestBackupScheduler_StartStop(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir)
	scheduler := NewBackupScheduler(manager)

	// Start the scheduler
	scheduler.Start()
	if !scheduler.running {
		t.Error("Expected scheduler to be running after Start()")
	}

	// Stop the scheduler
	scheduler.Stop()
	if scheduler.running {
		t.Error("Expected scheduler to not be running after Stop()")
	}
}

func TestBackupScheduler_SetFrequency(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir)
	scheduler := NewBackupScheduler(manager)

	// Test valid frequencies
	validFreqs := []BackupFrequency{Daily, Weekly}
	for _, freq := range validFreqs {
		scheduler.SetFrequency(freq)
		if scheduler.frequency != freq {
			t.Errorf("SetFrequency(%v): got %v, want %v", freq, scheduler.frequency, freq)
		}
	}

	// Test invalid frequency defaults to Daily
	scheduler.SetFrequency("invalid")
	if scheduler.frequency != Daily {
		t.Errorf("SetFrequency(invalid): got %v, want Daily", scheduler.frequency)
	}
}

func TestBackupScheduler_TriggerBackup(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir)
	scheduler := NewBackupScheduler(manager)

	// Trigger manual backup
	backupPath, err := scheduler.TriggerBackup()
	if err != nil {
		t.Fatalf("TriggerBackup() error = %v", err)
	}

	if backupPath == "" {
		t.Error("Expected backup path, got empty string")
	}

	// Verify backup exists
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		t.Errorf("Backup file does not exist: %s", backupPath)
	}

	// Verify last backup time was updated
	if scheduler.lastBackup.IsZero() {
		t.Error("Expected lastBackup to be set")
	}
}

func TestBackupScheduler_TriggerBackup_Callback(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir)
	scheduler := NewBackupScheduler(manager)

	var callbackCalled atomic.Bool
	var callbackPath string

	scheduler.SetOnBackupComplete(func(path string, err error) {
		callbackCalled.Store(true)
		callbackPath = path
	})

	backupPath, err := scheduler.TriggerBackup()
	if err != nil {
		t.Fatalf("TriggerBackup() error = %v", err)
	}

	// Wait a bit for callback
	time.Sleep(100 * time.Millisecond)

	if !callbackCalled.Load() {
		t.Error("Expected onBackupComplete callback to be called")
	}

	if callbackPath != backupPath {
		t.Errorf("Callback path = %s, want %s", callbackPath, backupPath)
	}
}

func TestBackupScheduler_IsRunning(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir)
	scheduler := NewBackupScheduler(manager)

	if scheduler.IsRunning() {
		t.Error("Expected IsRunning() to be false initially")
	}

	scheduler.Start()
	if !scheduler.IsRunning() {
		t.Error("Expected IsRunning() to be true after Start()")
	}

	scheduler.Stop()
	if scheduler.IsRunning() {
		t.Error("Expected IsRunning() to be false after Stop()")
	}
}

func TestBackupScheduler_SetNextBackupTime(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir)
	scheduler := NewBackupScheduler(manager)

	futureTime := time.Now().Add(1 * time.Hour)
	scheduler.SetNextBackupTime(futureTime)

	if !scheduler.nextBackup.Equal(futureTime) {
		t.Errorf("Next backup time = %v, want %v", scheduler.nextBackup, futureTime)
	}
}

func TestBackupScheduler_CalculateNextBackup(t *testing.T) {
	tests := []struct {
		name      string
		frequency BackupFrequency
		fromTime  time.Time
		wantMin   time.Duration
		wantMax   time.Duration
	}{
		{
			name:      "Daily from midnight",
			frequency: Daily,
			fromTime:  time.Date(2026, 4, 13, 0, 0, 0, 0, time.UTC),
			wantMin:   24 * time.Hour,
			wantMax:   25 * time.Hour,
		},
		{
			name:      "Daily from noon",
			frequency: Daily,
			fromTime:  time.Date(2026, 4, 13, 12, 0, 0, 0, time.UTC),
			wantMin:   12 * time.Hour,
			wantMax:   13 * time.Hour,
		},
		{
			name:      "Weekly from Sunday",
			frequency: Weekly,
			fromTime:  time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC), // Sunday
			wantMin:   7 * 24 * time.Hour,
			wantMax:   8 * 24 * time.Hour,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			next := calculateNextBackup(tt.frequency, tt.fromTime)
			diff := next.Sub(tt.fromTime)

			if diff < tt.wantMin || diff > tt.wantMax {
				t.Errorf("calculateNextBackup() diff = %v, want between %v and %v", diff, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestBackupScheduler_BackupWithRotation(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir)
	manager.SetRetentionCount(3)

	scheduler := NewBackupScheduler(manager)

	// Create 5 backups through scheduler
	for i := 0; i < 5; i++ {
		_, err := scheduler.TriggerBackup()
		if err != nil {
			t.Fatalf("TriggerBackup() error = %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}

	// Verify rotation occurred (only 3 should remain)
	backups, err := manager.ListBackups()
	if err != nil {
		t.Fatalf("ListBackups() error = %v", err)
	}

	if len(backups) != 3 {
		t.Errorf("Expected 3 backups after rotation, got %d", len(backups))
	}
}
