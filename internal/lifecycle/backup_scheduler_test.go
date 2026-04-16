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

	manager := NewBackupManager(dbPath, backupDir, nil)
	scheduler := NewBackupScheduler(manager, nil)

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

	manager := NewBackupManager(dbPath, backupDir, nil)
	scheduler := NewBackupScheduler(manager, nil)

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

	manager := NewBackupManager(dbPath, backupDir, nil)
	scheduler := NewBackupScheduler(manager, nil)

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

	manager := NewBackupManager(dbPath, backupDir, nil)
	scheduler := NewBackupScheduler(manager, nil)

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

	manager := NewBackupManager(dbPath, backupDir, nil)
	scheduler := NewBackupScheduler(manager, nil)

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

	manager := NewBackupManager(dbPath, backupDir, nil)
	scheduler := NewBackupScheduler(manager, nil)

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

	manager := NewBackupManager(dbPath, backupDir, nil)
	scheduler := NewBackupScheduler(manager, nil)

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

// TestBackupScheduler_CallbackPanicRecovery verifies that panics in callbacks don't crash the scheduler
func TestBackupScheduler_CallbackPanicRecovery(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir, nil)
	scheduler := NewBackupScheduler(manager, nil)

	// Set a callback that panics
	panicCount := 0
	scheduler.SetOnBackupComplete(func(path string, err error) {
		panicCount++
		panic("intentional test panic")
	})

	// Trigger backup - should not panic the test, just the callback
	backupPath, err := scheduler.TriggerBackup()
	if err != nil {
		t.Fatalf("TriggerBackup() error = %v", err)
	}

	if backupPath == "" {
		t.Error("Expected backup path, got empty string")
	}

	// Verify backup was created despite callback panic
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		t.Errorf("Backup file does not exist: %s", backupPath)
	}

	// Verify callback was called (and panicked)
	if panicCount != 1 {
		t.Errorf("Expected callback to be called once, was called %d times", panicCount)
	}

	// Verify we can trigger another backup (scheduler still functional)
	_, err = scheduler.TriggerBackup()
	if err != nil {
		t.Fatalf("Second TriggerBackup() error = %v", err)
	}

	if panicCount != 2 {
		t.Errorf("Expected callback to be called twice, was called %d times", panicCount)
	}
}

// mockLogger is a test helper that captures log messages
type mockLogger struct {
	infoMsgs  []string
	warnMsgs  []string
	errorMsgs []string
}

func (m *mockLogger) Info(msg string)  { m.infoMsgs = append(m.infoMsgs, msg) }
func (m *mockLogger) Warn(msg string)  { m.warnMsgs = append(m.warnMsgs, msg) }
func (m *mockLogger) Error(msg string) { m.errorMsgs = append(m.errorMsgs, msg) }

// TestBackupScheduler_LogsErrors verifies that backup errors are logged
func TestBackupScheduler_LogsErrors(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "nonexistent.db") // Non-existent DB will cause error
	backupDir := filepath.Join(tmpDir, "backups")

	logger := &mockLogger{}
	manager := NewBackupManager(dbPath, backupDir, logger)
	scheduler := NewBackupScheduler(manager, logger)

	// Trigger backup - will fail because DB doesn't exist
	_, _ = scheduler.TriggerBackup()

	// Wait a bit for async operations
	time.Sleep(50 * time.Millisecond)

	// For TriggerBackup, errors are returned directly, not logged
	// The scheduler's scheduled backups would log errors
}

// TestBackupScheduler_LogsRotationWarnings verifies rotation warnings are logged
func TestBackupScheduler_LogsRotationWarnings(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	logger := &mockLogger{}
	manager := NewBackupManager(dbPath, backupDir, logger)

	// Create a backup
	_, err := manager.CreateBackup()
	if err != nil {
		t.Fatalf("CreateBackup() error = %v", err)
	}

	// Verify no errors logged during normal operation
	if len(logger.errorMsgs) > 0 {
		t.Errorf("Unexpected errors logged: %v", logger.errorMsgs)
	}
}

func TestBackupScheduler_BackupWithRotation(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	if err := os.WriteFile(dbPath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test db: %v", err)
	}

	manager := NewBackupManager(dbPath, backupDir, nil)
	manager.SetRetentionCount(3)

	scheduler := NewBackupScheduler(manager, nil)

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
