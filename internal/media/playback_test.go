package media

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewPlaybackPipeline(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")

	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline failed: %v", err)
	}
	defer pipeline.Close()

	if pipeline.FilePath() != testFile {
		t.Errorf("Expected file path %s, got %s", testFile, pipeline.FilePath())
	}

	if pipeline.GetState() != StateStopped {
		t.Errorf("Expected initial state Stopped, got %s", pipeline.GetState())
	}
}

func TestPlaybackPipeline_PlayPauseStop(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline failed: %v", err)
	}
	defer pipeline.Close()

	if err := pipeline.Play(); err != nil {
		t.Fatalf("Play() failed: %v", err)
	}
	if pipeline.GetState() != StatePlaying {
		t.Errorf("Expected state Playing after Play(), got %s", pipeline.GetState())
	}

	if err := pipeline.Pause(); err != nil {
		t.Fatalf("Pause() failed: %v", err)
	}
	if pipeline.GetState() != StatePaused {
		t.Errorf("Expected state Paused after Pause(), got %s", pipeline.GetState())
	}

	if err := pipeline.Stop(); err != nil {
		t.Fatalf("Stop() failed: %v", err)
	}
	if pipeline.GetState() != StateStopped {
		t.Errorf("Expected state Stopped after Stop(), got %s", pipeline.GetState())
	}
}

func TestPlaybackPipeline_QueryPosition_NotPlaying(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline failed: %v", err)
	}
	defer pipeline.Close()

	pos := pipeline.QueryPosition()
	if pos >= 0 {
		t.Errorf("Expected negative position when not playing, got %f", pos)
	}
}

func TestPlaybackPipeline_QueryDuration_NotPlaying(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline failed: %v", err)
	}
	defer pipeline.Close()

	duration := pipeline.QueryDuration()
	if duration >= 0 {
		t.Errorf("Expected negative duration when not playing, got %f", duration)
	}
}

func TestPlaybackPipeline_Close(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline failed: %v", err)
	}

	if err := pipeline.Close(); err != nil {
		t.Fatalf("Close() failed: %v", err)
	}

	if pos := pipeline.QueryPosition(); pos >= 0 {
		t.Errorf("Expected negative position after close, got %f", pos)
	}

	if duration := pipeline.QueryDuration(); duration >= 0 {
		t.Errorf("Expected negative duration after close, got %f", duration)
	}
}

func TestPlaybackPipeline_SeekTo_NotPlaying(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline failed: %v", err)
	}
	defer pipeline.Close()

	result := pipeline.SeekTo(5.0)
	_ = result
}

func TestPlaybackPipeline_PipelineQuerierInterface(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline failed: %v", err)
	}
	defer pipeline.Close()

	var _ PipelineQuerier = pipeline

	if state := pipeline.GetState(); state != StateStopped {
		t.Errorf("Expected initial state Stopped, got %v", state)
	}

	if pos := pipeline.QueryPosition(); pos >= 0 {
		t.Errorf("Expected negative position for empty file, got %f", pos)
	}
}

func TestPlaybackPipeline_ErrorCallbacks(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	pipeline, err := NewPlaybackPipeline(testFile)
	if err != nil {
		t.Fatalf("NewPlaybackPipeline failed: %v", err)
	}
	defer pipeline.Close()

	errorCalled := false
	pipeline.onError = func(err error) {
		errorCalled = true
	}

	pipeline.onWarning = func(w warning) {
	}

	if !errorCalled {
		t.Log("Error callback registered (not triggered in normal operation)")
	}
}
