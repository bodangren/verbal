package ui

import (
	"os"
	"testing"
	"time"

	"verbal/internal/lifecycle"
)

func TestBackupSettingsDialog_New(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	dialog := NewBackupSettingsDialog(nil)
	if dialog == nil {
		t.Fatal("Expected dialog instance, got nil")
	}
}

func TestBackupSettingsDialog_SetGetAutoBackupEnabled(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	dialog := NewBackupSettingsDialog(nil)

	// Default should be false
	if dialog.IsAutoBackupEnabled() {
		t.Error("Expected auto-backup to be disabled by default")
	}

	// Enable
	dialog.SetAutoBackupEnabled(true)
	if !dialog.IsAutoBackupEnabled() {
		t.Error("Expected auto-backup to be enabled after SetAutoBackupEnabled(true)")
	}

	// Disable
	dialog.SetAutoBackupEnabled(false)
	if dialog.IsAutoBackupEnabled() {
		t.Error("Expected auto-backup to be disabled after SetAutoBackupEnabled(false)")
	}
}

func TestBackupSettingsDialog_SetGetFrequency(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	dialog := NewBackupSettingsDialog(nil)

	// Default should be Daily
	if dialog.GetFrequency() != lifecycle.Daily {
		t.Errorf("Expected default frequency Daily, got %v", dialog.GetFrequency())
	}

	// Set Weekly
	dialog.SetFrequency(lifecycle.Weekly)
	if dialog.GetFrequency() != lifecycle.Weekly {
		t.Errorf("Expected frequency Weekly, got %v", dialog.GetFrequency())
	}

	// Set Daily
	dialog.SetFrequency(lifecycle.Daily)
	if dialog.GetFrequency() != lifecycle.Daily {
		t.Errorf("Expected frequency Daily, got %v", dialog.GetFrequency())
	}
}

func TestBackupSettingsDialog_SetGetRetentionCount(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	dialog := NewBackupSettingsDialog(nil)

	// Default should be 10
	if dialog.GetRetentionCount() != 10 {
		t.Errorf("Expected default retention 10, got %d", dialog.GetRetentionCount())
	}

	// Set to 5
	dialog.SetRetentionCount(5)
	if dialog.GetRetentionCount() != 5 {
		t.Errorf("Expected retention 5, got %d", dialog.GetRetentionCount())
	}

	// Set to 0 (should be clamped to 1)
	dialog.SetRetentionCount(0)
	if dialog.GetRetentionCount() != 1 {
		t.Errorf("Expected retention 1 (clamped), got %d", dialog.GetRetentionCount())
	}
}

func TestBackupSettingsDialog_SetGetBackupDir(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	dialog := NewBackupSettingsDialog(nil)

	// Set backup directory
	testDir := "/home/user/backups"
	dialog.SetBackupDir(testDir)
	if dialog.GetBackupDir() != testDir {
		t.Errorf("Expected backup dir %s, got %s", testDir, dialog.GetBackupDir())
	}
}

func TestBackupSettingsDialog_SetOnSave(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	dialog := NewBackupSettingsDialog(nil)

	saveCalled := false
	var savedEnabled bool
	var savedFreq lifecycle.BackupFrequency
	var savedRetention int

	dialog.SetOnSave(func(enabled bool, freq lifecycle.BackupFrequency, retention int, backupDir string) {
		saveCalled = true
		savedEnabled = enabled
		savedFreq = freq
		savedRetention = retention
	})

	// Configure dialog
	dialog.SetAutoBackupEnabled(true)
	dialog.SetFrequency(lifecycle.Weekly)
	dialog.SetRetentionCount(5)
	dialog.SetBackupDir("/test/backups")

	// Simulate save
	dialog.simulateSave()

	if !saveCalled {
		t.Error("Expected onSave callback to be called")
	}

	if !savedEnabled {
		t.Error("Expected savedEnabled to be true")
	}

	if savedFreq != lifecycle.Weekly {
		t.Errorf("Expected savedFreq Weekly, got %v", savedFreq)
	}

	if savedRetention != 5 {
		t.Errorf("Expected savedRetention 5, got %d", savedRetention)
	}
}

func TestBackupSettingsDialog_UpdateLastBackupTime(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	dialog := NewBackupSettingsDialog(nil)

	testTime := time.Date(2026, 4, 13, 10, 30, 0, 0, time.UTC)
	dialog.UpdateLastBackupTime(testTime)

	// Verify internal state
	if dialog.lastBackup.IsZero() {
		t.Error("Expected lastBackup to be set")
	}
}

func TestBackupSettingsDialog_UpdateNextBackupTime(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	dialog := NewBackupSettingsDialog(nil)

	testTime := time.Date(2026, 4, 14, 0, 0, 0, 0, time.UTC)
	dialog.UpdateNextBackupTime(testTime)

	// Verify internal state
	if dialog.nextBackup.IsZero() {
		t.Error("Expected nextBackup to be set")
	}
}

func TestBackupSettingsDialog_ClampRetention(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}

	tests := []struct {
		input    int
		expected int
	}{
		{0, 1},
		{-5, 1},
		{1, 1},
		{5, 5},
		{10, 10},
		{100, 100},
	}

	dialog := NewBackupSettingsDialog(nil)
	for _, tt := range tests {
		dialog.SetRetentionCount(tt.input)
		if dialog.GetRetentionCount() != tt.expected {
			t.Errorf("SetRetentionCount(%d): got %d, want %d", tt.input, dialog.GetRetentionCount(), tt.expected)
		}
	}
}
