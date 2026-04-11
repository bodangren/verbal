package ui

import (
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/lifecycle"
)

// TestImportDialogCreation tests that ImportDialog can be created.
func TestImportDialogCreation(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewImportDialog(nil)
	if dialog == nil {
		t.Fatal("Expected dialog to be created")
	}

	// Verify initial state
	if dialog.duplicateHandling != lifecycle.DuplicateSkip {
		t.Error("Expected default duplicate handling to be DuplicateSkip")
	}
}

// TestImportDialogCallbacks tests callback registration.
func TestImportDialogCallbacks(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewImportDialog(nil)

	// Test import callback
	importCalled := false
	dialog.SetOnImport(func(archivePath string, handling lifecycle.DuplicateHandling) {
		importCalled = true
	})

	if dialog.onImport == nil {
		t.Error("Expected onImport callback to be set")
	}

	// Test cancel callback
	cancelCalled := false
	dialog.SetOnCancel(func() {
		cancelCalled = true
	})

	if dialog.onCancel == nil {
		t.Error("Expected onCancel callback to be set")
	}

	_ = importCalled
	_ = cancelCalled
}

// TestImportDialogProgressUpdate tests progress update functionality.
func TestImportDialogProgressUpdate(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewImportDialog(nil)

	// Test progress update
	dialog.UpdateProgress(50, "Testing import progress...")

	// Verify internal state
	if dialog.progressPercent != 50 {
		t.Errorf("Expected progress 50, got %d", dialog.progressPercent)
	}

	if dialog.progressMessage != "Testing import progress..." {
		t.Errorf("Expected message 'Testing import progress...', got %s", dialog.progressMessage)
	}
}

// TestImportDialogResult tests setting import results.
func TestImportDialogResult(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewImportDialog(nil)

	// Test setting result
	result := &lifecycle.ImportResult{
		ImportedCount: 5,
		SkippedCount:  2,
		ReplacedCount: 1,
		Errors:        []error{},
		ImportedIDs:   []string{"1", "2", "3", "4", "5"},
	}

	dialog.SetResult(result)

	if dialog.result == nil {
		t.Fatal("Expected result to be set")
	}

	if dialog.result.ImportedCount != 5 {
		t.Errorf("Expected ImportedCount 5, got %d", dialog.result.ImportedCount)
	}

	if dialog.result.SkippedCount != 2 {
		t.Errorf("Expected SkippedCount 2, got %d", dialog.result.SkippedCount)
	}
}

// TestImportDialogEnableDisable tests enabling/disabling the import button.
func TestImportDialogEnableDisable(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewImportDialog(nil)

	// Should be disabled initially (no file selected)
	if dialog.importButton.Sensitive() {
		t.Error("Expected import button to be disabled initially")
	}
}

// TestDuplicateHandlingValues tests the duplicate handling enum values.
func TestDuplicateHandlingValues(t *testing.T) {
	if lifecycle.DuplicateSkip != 0 {
		t.Errorf("Expected DuplicateSkip to be 0, got %d", lifecycle.DuplicateSkip)
	}

	if lifecycle.DuplicateReplace != 1 {
		t.Errorf("Expected DuplicateReplace to be 1, got %d", lifecycle.DuplicateReplace)
	}

	if lifecycle.DuplicateRename != 2 {
		t.Errorf("Expected DuplicateRename to be 2, got %d", lifecycle.DuplicateRename)
	}
}
