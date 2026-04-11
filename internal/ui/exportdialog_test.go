package ui

import (
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/db"
)

// TestExportDialogCreation tests that ExportDialog can be created.
func TestExportDialogCreation(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewExportDialog(nil)
	if dialog == nil {
		t.Fatal("Expected dialog to be created")
	}

	// Verify initial state
	if dialog.exportType != ExportSingle {
		t.Error("Expected default export type to be ExportSingle")
	}
}

// TestExportDialogSetRecording tests setting a recording for single export.
func TestExportDialogSetRecording(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewExportDialog(nil)

	recording := &db.Recording{
		ID:       1,
		FilePath: "/path/to/test.mp4",
	}

	dialog.SetRecording(recording)

	if dialog.recording == nil {
		t.Fatal("Expected recording to be set")
	}

	if dialog.recording.ID != 1 {
		t.Errorf("Expected ID 1, got %d", dialog.recording.ID)
	}

	if dialog.recording.FilePath != "/path/to/test.mp4" {
		t.Errorf("Expected path '/path/to/test.mp4', got %s", dialog.recording.FilePath)
	}
}

// TestExportDialogCallbacks tests callback registration.
func TestExportDialogCallbacks(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewExportDialog(nil)

	// Test export callback
	exportCalled := false
	dialog.SetOnExport(func(recordingID string, destPath string) {
		exportCalled = true
	})

	if dialog.onExport == nil {
		t.Error("Expected onExport callback to be set")
	}

	// Test cancel callback
	cancelCalled := false
	dialog.SetOnCancel(func() {
		cancelCalled = true
	})

	if dialog.onCancel == nil {
		t.Error("Expected onCancel callback to be set")
	}

	_ = exportCalled
	_ = cancelCalled
}

// TestExportDialogExportType tests switching export types.
func TestExportDialogExportType(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewExportDialog(nil)

	// Set recording for single export
	recording := &db.Recording{
		ID:       1,
		FilePath: "/path/to/test.mp4",
	}
	dialog.SetRecording(recording)

	// Initially should be single export
	if dialog.exportType != ExportSingle {
		t.Error("Expected ExportSingle type when recording is set")
	}
}

// TestExportDialogProgressUpdate tests progress update functionality.
func TestExportDialogProgressUpdate(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewExportDialog(nil)

	// Test progress update
	dialog.UpdateProgress(50, "Testing progress...")

	// Verify internal state
	if dialog.progressPercent != 50 {
		t.Errorf("Expected progress 50, got %d", dialog.progressPercent)
	}

	if dialog.progressMessage != "Testing progress..." {
		t.Errorf("Expected message 'Testing progress...', got %s", dialog.progressMessage)
	}
}

// TestExportDialogEnableDisable tests enabling/disabling the export button.
func TestExportDialogEnableDisable(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewExportDialog(nil)

	// Should be disabled initially (no destination set)
	if dialog.exportButton.Sensitive() {
		t.Error("Expected export button to be disabled initially")
	}
}

// TestExportTypeEnum tests the export type enum values.
func TestExportTypeEnum(t *testing.T) {
	if ExportSingle != 0 {
		t.Errorf("Expected ExportSingle to be 0, got %d", ExportSingle)
	}

	if ExportAll != 1 {
		t.Errorf("Expected ExportAll to be 1, got %d", ExportAll)
	}
}
