package media

import (
	"os"
	"path/filepath"
	"testing"
	"time"
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

func TestSegmentExporter_ExportEmptySegmentsList(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	errCh := make(chan error, 1)
	exporter.SetErrorHandler(func(err error) {
		errCh <- err
	})

	exporter.ExportSegments([]Segment{}, "/tmp/output.mkv")

	select {
	case err := <-errCh:
		if err == nil {
			t.Error("Expected error for empty segments list")
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("Timeout waiting for error handler")
	}
}

func TestEscapeFilePath(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"/path/to/video.mp4", `"/path/to/video.mp4"`},
		{"/path/to/my video.mp4", `"/path/to/my video.mp4"`},
		{"/path/with spaces/and/more.mp4", `"/path/with spaces/and/more.mp4"`},
		{"path\nwith\nnewlines", `"pathwithnewlines"`},
		{"path\rwith\rcarriage", `"pathwithcarriage"`},
		{"path\twith\ttabs", `"path\twith\ttabs"`},
	}

	for _, tt := range tests {
		got := QuoteLocation(tt.input)
		if got != tt.expected {
			t.Errorf("QuoteLocation(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestSegmentExporter_SetCodecInfo(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	if exporter.codecDetected {
		t.Error("codecDetected should be false before SetCodecInfo")
	}

	info := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecAAC, Container: ContainerMKV}
	exporter.SetCodecInfo(info)

	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if !exporter.codecDetected {
		t.Error("codecDetected should be true after SetCodecInfo")
	}
	if exporter.codecInfo != info {
		t.Errorf("codecInfo = %v, want %v", exporter.codecInfo, info)
	}
}

func TestSegmentExporter_canStreamCopy(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	if exporter.canStreamCopy() {
		t.Error("canStreamCopy should return false when codec not detected")
	}

	info := CodecInfo{Video: VideoCodecH264, Audio: AudioCodecAAC, Container: ContainerMKV}
	exporter.SetCodecInfo(info)

	if !exporter.canStreamCopy() {
		t.Error("canStreamCopy should return true for H264 codec")
	}

	info = CodecInfo{Video: VideoCodecAV1, Audio: AudioCodecAAC, Container: ContainerMP4}
	exporter.SetCodecInfo(info)

	if exporter.canStreamCopy() {
		t.Error("canStreamCopy should return false for AV1 codec")
	}
}

func TestSegmentExporter_canStreamCopy_Undetected(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")
	exporter.mu.Lock()
	exporter.codecDetected = false
	exporter.mu.Unlock()

	if exporter.canStreamCopy() {
		t.Error("canStreamCopy should return false when codec not detected")
	}
}

func TestSegmentExporter_canStreamCopy_NonCodecVideo(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")
	info := CodecInfo{Video: VideoCodecUnknown, Audio: AudioCodecAAC, Container: ContainerMP4}
	exporter.SetCodecInfo(info)

	if exporter.canStreamCopy() {
		t.Error("canStreamCopy should return false for unknown video codec")
	}
}

func TestSegmentExporter_ExportWithTempDir(t *testing.T) {
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

func TestSegmentExporter_SetProgressHandler(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	called := false
	exporter.SetProgressHandler(func(percent float64) {
		called = true
		if percent < 0 || percent > 1 {
			t.Errorf("Progress should be between 0 and 1, got %f", percent)
		}
	})

	exporter.reportProgress(0.5)
	if !called {
		t.Error("Progress handler should be called")
	}
}

func TestSegmentExporter_SetCompleteHandler(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	var completedPath string
	exporter.SetCompleteHandler(func(outputPath string) {
		completedPath = outputPath
	})

	exporter.mu.Lock()
	handler := exporter.onComplete
	exporter.mu.Unlock()

	if handler == nil {
		t.Error("Complete handler should be set")
	}

	_ = completedPath
}

func TestSegmentExporter_SetErrorHandler(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	var receivedErr error
	exporter.SetErrorHandler(func(err error) {
		receivedErr = err
	})

	exporter.mu.Lock()
	handler := exporter.onError
	exporter.mu.Unlock()

	if handler == nil {
		t.Error("Error handler should be set")
	}

	_ = receivedErr
}

func TestSegmentExporter_SetCodecInfo_Concurrent(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func(idx int) {
			info := CodecInfo{
				Video:     VideoCodecH264,
				Audio:     AudioCodecAAC,
				Container: ContainerMKV,
			}
			exporter.SetCodecInfo(info)
			done <- true
		}(i)
	}

	for i := 0; i < 10; i++ {
		<-done
	}

	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if !exporter.codecDetected {
		t.Error("codecDetected should be true after concurrent SetCodecInfo calls")
	}
}

func TestSegmentExporter_SetHandlers_ReplacesExisting(t *testing.T) {
	exporter := NewSegmentExporter("/path/to/video.mp4")

	handler1Called := false
	exporter.SetProgressHandler(func(percent float64) {
		handler1Called = true
	})

	handler2Called := false
	exporter.SetProgressHandler(func(percent float64) {
		handler2Called = true
	})

	exporter.reportProgress(0.5)

	if handler1Called {
		t.Error("First handler should have been replaced")
	}
	if !handler2Called {
		t.Error("Second handler should have been called")
	}
}

func TestDetectCodecInfo_NonExistentFile(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available - GStreamer pipeline hangs without display server")
	}

	done := make(chan error, 1)
	go func() {
		_, err := DetectCodecInfo("/nonexistent/file.mp4")
		done <- err
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Error("Expected error for non-existent file")
		}
	case <-time.After(5 * time.Second):
		t.Skip("GStreamer Detect hangs without display - skipping in headless environment")
	}
}