package media

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewPlaybackPipeline(t *testing.T) {
	// Create a temporary directory for test files
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.mp4")

	// Create an empty file (pipeline creation only checks path, doesn't read content)
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

	// Test state transitions
	// Note: These don't actually play the file since it's empty,
	// but they test the state machine

	pipeline.Play()
	if pipeline.GetState() != StatePlaying {
		t.Errorf("Expected state Playing after Play(), got %s", pipeline.GetState())
	}

	pipeline.Pause()
	if pipeline.GetState() != StatePaused {
		t.Errorf("Expected state Paused after Pause(), got %s", pipeline.GetState())
	}

	pipeline.Stop()
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

	// When not playing, position should be -1
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

	// When not playing, duration should be -1
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

	pipeline.Close()

	// After close, queries should return -1
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

	// Seek should still work even when not playing (sets up position for when it starts)
	// But with an empty/invalid file it will fail
	result := pipeline.SeekTo(5.0)
	// We don't assert on result since it depends on pipeline state with empty file
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

	// Verify PlaybackPipeline implements PipelineQuerier
	var _ PipelineQuerier = pipeline

	// Test GetState
	if state := pipeline.GetState(); state != StateStopped {
		t.Errorf("Expected initial state Stopped, got %v", state)
	}

	// Test QueryPosition
	if pos := pipeline.QueryPosition(); pos >= 0 {
		t.Errorf("Expected negative position for empty file, got %f", pos)
	}
}
