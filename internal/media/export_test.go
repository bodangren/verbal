package media

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSegmentExporter_NewSegmentExporter(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")
	if exporter == nil {
		t.Fatal("NewSegmentExporter returned nil")
	}
	if exporter.sourcePath != "/path/to/video.mp4" {
		t.Errorf("Expected sourcePath '/path/to/video.mp4', got '%s'", exporter.sourcePath)
	}
}

func TestSegmentExporter_SetHandlers(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	progressCalled := false
	exporter.SetProgressHandler(func(percent float64) {
		progressCalled = true
	})

	exporter.reportProgress(0.5)
	if !progressCalled {
		t.Error("Progress handler not called")
	}

	completeCalled := false
	exporter.SetCompleteHandler(func(outputPath string) {
		completeCalled = true
	})

	exporter.mu.Lock()
	handler := exporter.onComplete
	exporter.mu.Unlock()

	if handler == nil {
		t.Error("Complete handler not set")
	}

	_ = completeCalled
}

func TestSegmentExporter_ExportNoSegments(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	errCh := make(chan error, 1)
	exporter.SetErrorHandler(func(err error) {
		errCh <- err
	})

	exporter.ExportSegments(nil, "/tmp/output.mkv")

	err := <-errCh
	if err == nil {
		t.Error("Expected error for empty segments")
	}
}

func TestEscapeFilePath(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"/path/to/video.mp4", "/path/to/video.mp4"},
		{"/path/to/my video.mp4", `"/path/to/my video.mp4"`},
		{"/path/with spaces/and/more.mp4", `"/path/with spaces/and/more.mp4"`},
	}

	for _, tt := range tests {
		got := escapeFilePath(tt.input)
		if got != tt.expected {
			t.Errorf("escapeFilePath(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestSegmentExporter_ExportWithTempDir(t *testing.T) {
	// Test that temp directory creation works
	tempDir, err := os.MkdirTemp("", "verbal-export-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	tempFile := filepath.Join(tempDir, "segment_0.mkv")
	if _, err := os.Create(tempFile); err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}

	if _, err := os.Stat(tempFile); os.IsNotExist(err) {
		t.Error("Temp file should exist")
	}
}
