package ui

import (
	"testing"

	"verbal/internal/filler"
)

func TestFillerRemovalDialog_NewFillerRemovalDialog(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)
	if dialog == nil {
		t.Fatal("NewFillerRemovalDialog returned nil")
	}
}

func TestFillerRemovalDialog_SetRecording(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)
	dialog.SetRecording(123, "/path/to/video.mp4")

	if dialog.recordingID != 123 {
		t.Errorf("expected recordingID 123, got %d", dialog.recordingID)
	}
	if dialog.recordingPath != "/path/to/video.mp4" {
		t.Errorf("expected recordingPath '/path/to/video.mp4', got '%s'", dialog.recordingPath)
	}
}

func TestFillerRemovalDialog_SetFillerService(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)
	detector := filler.NewDefaultDetector(filler.DefaultConfig())
	svc := filler.NewFillerService(detector)

	dialog.SetFillerService(svc)

	if dialog.fillerService == nil {
		t.Error("expected fillerService to be set")
	}
}

func TestFillerRemovalDialog_UpdateProgress(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)

	dialog.UpdateProgress(50, "Processing...")

	if dialog.progressPercent != 50 {
		t.Errorf("expected progressPercent 50, got %d", dialog.progressPercent)
	}
}

func TestFillerRemovalDialog_ShowError(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)

	dialog.ShowError("Test error message")
}

func TestFillerRemovalDialog_SetRemovingState(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)

	dialog.SetRemovingState(true)
	dialog.SetRemovingState(false)
}

func TestFillerRemovalDialog_SetOnRemove(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)
	called := false

	dialog.SetOnRemove(func() {
		called = true
	})

	dialog.onRemove()

	if !called {
		t.Error("expected onRemove callback to be called")
	}
}

func TestFillerRemovalDialog_SetOnComplete(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)
	var receivedPath string
	var receivedCount int

	dialog.SetOnComplete(func(outputPath string, removedCount int) {
		receivedPath = outputPath
		receivedCount = removedCount
	})

	dialog.onComplete("/output/path.mp4", 5)

	if receivedPath != "/output/path.mp4" {
		t.Errorf("expected outputPath '/output/path.mp4', got '%s'", receivedPath)
	}
	if receivedCount != 5 {
		t.Errorf("expected removedCount 5, got %d", receivedCount)
	}
}

func TestFillerRemovalDialog_SetOnCancel(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)
	called := false

	dialog.SetOnCancel(func() {
		called = true
	})

	dialog.onCancel()

	if !called {
		t.Error("expected onCancel callback to be called")
	}
}

func TestFillerRemovalDialog_ShowResult(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	dialog := NewFillerRemovalDialog(nil)
	dialog.ShowResult("/output/path.mp4", 10)

	if dialog.resultLabel.GetText() == "" {
		t.Error("expected resultLabel to have text after ShowResult")
	}
}