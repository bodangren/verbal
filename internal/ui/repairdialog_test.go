package ui

import (
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/db"
	"verbal/internal/lifecycle"
)

// TestRepairDialogCreation tests that RepairDialog can be created.
func TestRepairDialogCreation(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewRepairDialog(nil)
	if dialog == nil {
		t.Fatal("Expected dialog to be created")
	}
}

// TestRepairDialogSetInspectionReport tests setting an inspection report.
func TestRepairDialogSetInspectionReport(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewRepairDialog(nil)

	report := &lifecycle.InspectionReport{
		TotalIssues: 3,
		OrphanedRecordings: []*db.Recording{
			{ID: 1, FilePath: "/path/to/missing1.mp4"},
		},
		MissingThumbnails: []*db.Recording{
			{ID: 2, FilePath: "/path/to/missing2.mp4"},
		},
		InvalidTranscriptions: []*db.Recording{
			{ID: 3, FilePath: "/path/to/invalid3.mp4"},
		},
	}

	dialog.SetInspectionReport(report)

	if dialog.inspectionReport == nil {
		t.Fatal("Expected inspection report to be set")
	}

	if dialog.inspectionReport.TotalIssues != 3 {
		t.Errorf("Expected TotalIssues 3, got %d", dialog.inspectionReport.TotalIssues)
	}
}

// TestRepairDialogCallbacks tests callback registration.
func TestRepairDialogCallbacks(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewRepairDialog(nil)

	// Test scan callback
	scanCalled := false
	dialog.SetOnScan(func() {
		scanCalled = true
	})

	if dialog.onScan == nil {
		t.Error("Expected onScan callback to be set")
	}

	// Test repair callback
	repairCalled := false
	dialog.SetOnRepair(func(options RepairOptions) {
		repairCalled = true
	})

	if dialog.onRepair == nil {
		t.Error("Expected onRepair callback to be set")
	}

	// Test close callback
	closeCalled := false
	dialog.SetOnClose(func() {
		closeCalled = true
	})

	if dialog.onClose == nil {
		t.Error("Expected onClose callback to be set")
	}

	_ = scanCalled
	_ = repairCalled
	_ = closeCalled
}

// TestRepairDialogProgressUpdate tests progress update functionality.
func TestRepairDialogProgressUpdate(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewRepairDialog(nil)

	// Test progress update
	dialog.UpdateProgress(50, "Testing repair progress...")

	// Verify internal state
	if dialog.progressPercent != 50 {
		t.Errorf("Expected progress 50, got %d", dialog.progressPercent)
	}

	if dialog.progressMessage != "Testing repair progress..." {
		t.Errorf("Expected message 'Testing repair progress...', got %s", dialog.progressMessage)
	}
}

// TestRepairDialogSetRepairReport tests setting a repair report.
func TestRepairDialogSetRepairReport(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewRepairDialog(nil)

	// Test setting repair report
	report := &lifecycle.RepairReport{
		TotalRepairs:          5,
		RemovedOrphans:        []int64{1, 2},
		MarkedUnavailable:     []int64{3},
		RegeneratedThumbnails: []int64{4, 5},
		Errors:                []string{},
	}

	dialog.SetRepairReport(report)

	if dialog.repairReport == nil {
		t.Fatal("Expected repair report to be set")
	}

	if dialog.repairReport.TotalRepairs != 5 {
		t.Errorf("Expected TotalRepairs 5, got %d", dialog.repairReport.TotalRepairs)
	}
}

// TestRepairOptionsStruct tests the RepairOptions struct.
func TestRepairOptionsStruct(t *testing.T) {
	options := RepairOptions{
		RemoveOrphans:        true,
		RegenerateThumbnails: true,
	}

	if !options.RemoveOrphans {
		t.Error("Expected RemoveOrphans to be true")
	}

	if !options.RegenerateThumbnails {
		t.Error("Expected RegenerateThumbnails to be true")
	}
}

// TestRepairDialogWithEmptyReport tests behavior with empty inspection report.
func TestRepairDialogWithEmptyReport(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	gtk.Init()

	dialog := NewRepairDialog(nil)

	// Set empty report
	report := &lifecycle.InspectionReport{
		TotalIssues:           0,
		OrphanedRecordings:    []*db.Recording{},
		MissingThumbnails:     []*db.Recording{},
		InvalidTranscriptions: []*db.Recording{},
	}

	dialog.SetInspectionReport(report)

	if dialog.inspectionReport.TotalIssues != 0 {
		t.Error("Expected no issues in empty report")
	}
}
