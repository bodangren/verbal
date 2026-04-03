package ui

import (
	"os"
	"path/filepath"
	"testing"

	"verbal/internal/ai"
)

func TestRecordingLoader_LoadRecording(t *testing.T) {
	loader := NewRecordingLoader()
	if loader == nil {
		t.Fatal("NewRecordingLoader returned nil")
	}

	// Test with a non-existent file
	result := loader.LoadRecording("/nonexistent/path/video.mkv")

	if result.Error == nil {
		t.Error("Expected error for non-existent file, got nil")
	}
	if result.Exists {
		t.Error("Expected Exists=false for non-existent file")
	}
}

func TestRecordingLoader_LoadRecordingWithTranscription(t *testing.T) {
	// Create a temporary directory for test files
	tempDir := t.TempDir()
	videoPath := filepath.Join(tempDir, "test_video.mkv")
	metaPath := filepath.Join(tempDir, "test_video.json")

	// Create a dummy video file
	err := os.WriteFile(videoPath, []byte("dummy video content"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test video file: %v", err)
	}

	// Create a metadata file with transcription
	metaContent := `{
		"video_file": "test_video.mkv",
		"duration_ms": 5000,
		"transcription": {
			"text": "Hello world",
			"words": [
				{"text": "Hello", "start": 0.0, "end": 0.5},
				{"text": "world", "start": 0.6, "end": 1.0}
			]
		}
	}`
	err = os.WriteFile(metaPath, []byte(metaContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create test metadata file: %v", err)
	}

	loader := NewRecordingLoader()
	result := loader.LoadRecording(videoPath)

	if result.Error != nil {
		t.Errorf("Unexpected error: %v", result.Error)
	}
	if !result.Exists {
		t.Error("Expected Exists=true for existing file")
	}
	if result.VideoPath != videoPath {
		t.Errorf("Expected VideoPath=%s, got %s", videoPath, result.VideoPath)
	}
	if result.MetadataPath != metaPath {
		t.Errorf("Expected MetadataPath=%s, got %s", metaPath, result.MetadataPath)
	}
	if !result.HasTranscription {
		t.Error("Expected HasTranscription=true")
	}
	if result.Transcription == nil {
		t.Error("Expected Transcription to be loaded")
	}
}

func TestRecordingLoader_LoadRecordingWithoutTranscription(t *testing.T) {
	// Create a temporary directory for test files
	tempDir := t.TempDir()
	videoPath := filepath.Join(tempDir, "test_video.mkv")

	// Create only a dummy video file (no metadata)
	err := os.WriteFile(videoPath, []byte("dummy video content"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test video file: %v", err)
	}

	loader := NewRecordingLoader()
	result := loader.LoadRecording(videoPath)

	if result.Error != nil {
		t.Errorf("Unexpected error: %v", result.Error)
	}
	if !result.Exists {
		t.Error("Expected Exists=true for existing file")
	}
	if result.HasTranscription {
		t.Error("Expected HasTranscription=false when no metadata file")
	}
	if result.Transcription != nil {
		t.Error("Expected Transcription=nil when no metadata file")
	}
}

func TestRecordingLoader_LoadRecordingWithCorruptedMetadata(t *testing.T) {
	// Create a temporary directory for test files
	tempDir := t.TempDir()
	videoPath := filepath.Join(tempDir, "test_video.mkv")
	metaPath := filepath.Join(tempDir, "test_video.json")

	// Create a dummy video file
	err := os.WriteFile(videoPath, []byte("dummy video content"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test video file: %v", err)
	}

	// Create a corrupted metadata file
	err = os.WriteFile(metaPath, []byte("not valid json"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test metadata file: %v", err)
	}

	loader := NewRecordingLoader()
	result := loader.LoadRecording(videoPath)

	// Should still load the video but handle the corrupted metadata gracefully
	if result.Error != nil {
		t.Errorf("Unexpected error: %v", result.Error)
	}
	if !result.Exists {
		t.Error("Expected Exists=true for existing file")
	}
	if result.HasTranscription {
		t.Error("Expected HasTranscription=false for corrupted metadata")
	}
	if result.Transcription != nil {
		t.Error("Expected Transcription=nil for corrupted metadata")
	}
}

func TestRecordingLoader_GetMetadataPath(t *testing.T) {
	loader := NewRecordingLoader()

	tests := []struct {
		videoPath string
		expected  string
	}{
		{
			videoPath: "/path/to/video.mkv",
			expected:  "/path/to/video.json",
		},
		{
			videoPath: "video.mp4",
			expected:  "video.json",
		},
		{
			videoPath: "/my/recording.webm",
			expected:  "/my/recording.json",
		},
	}

	for _, tt := range tests {
		result := loader.GetMetadataPath(tt.videoPath)
		if result != tt.expected {
			t.Errorf("GetMetadataPath(%s) = %s, expected %s", tt.videoPath, result, tt.expected)
		}
	}
}

func TestRecordingLoader_LoadRecordingResult_HasWordData(t *testing.T) {
	// Create a temporary directory for test files
	tempDir := t.TempDir()
	videoPath := filepath.Join(tempDir, "test_video.mkv")
	metaPath := filepath.Join(tempDir, "test_video.json")

	// Create a dummy video file
	err := os.WriteFile(videoPath, []byte("dummy"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test video file: %v", err)
	}

	// Create metadata with word-level transcription
	metaContent := `{
		"video_file": "test_video.mkv",
		"duration_ms": 5000,
		"transcription": {
			"text": "Hello world test",
			"words": [
				{"text": "Hello", "start": 0.0, "end": 0.5},
				{"text": "world", "start": 0.6, "end": 1.0},
				{"text": "test", "start": 1.1, "end": 1.5}
			]
		}
	}`
	err = os.WriteFile(metaPath, []byte(metaContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create test metadata file: %v", err)
	}

	loader := NewRecordingLoader()
	result := loader.LoadRecording(videoPath)

	if !result.HasTranscription {
		t.Fatal("Expected HasTranscription=true")
	}

	// Verify word data was converted correctly
	if len(result.WordData) != 3 {
		t.Errorf("Expected 3 words, got %d", len(result.WordData))
	}

	// Verify first word
	if len(result.WordData) > 0 {
		word := result.WordData[0]
		if word.Text != "Hello" {
			t.Errorf("Expected first word 'Hello', got '%s'", word.Text)
		}
		if word.StartTime != 0.0 {
			t.Errorf("Expected first word start 0.0, got %f", word.StartTime)
		}
	}
}

func TestRecordingLoader_LoadRecordingResult_WordsToWordData(t *testing.T) {
	words := []ai.Word{
		{Text: "First", Start: 0.0, End: 0.5},
		{Text: "second", Start: 0.6, End: 1.0},
		{Text: "third", Start: 1.1, End: 1.5},
	}

	wordData := wordsToWordData(words)

	if len(wordData) != 3 {
		t.Errorf("Expected 3 word data items, got %d", len(wordData))
	}

	for i, wd := range wordData {
		if wd.Text != words[i].Text {
			t.Errorf("Word %d: expected text '%s', got '%s'", i, words[i].Text, wd.Text)
		}
		if wd.StartTime != words[i].Start {
			t.Errorf("Word %d: expected start %f, got %f", i, words[i].Start, wd.StartTime)
		}
		if wd.Index != i {
			t.Errorf("Word %d: expected index %d, got %d", i, i, wd.Index)
		}
	}
}

func TestRecordingLoader_LoadDirectoryPath(t *testing.T) {
	loader := NewRecordingLoader()

	// Create a temporary directory and pass it as the video path
	tempDir := t.TempDir()

	result := loader.LoadRecording(tempDir)

	if result.Error == nil {
		t.Error("Expected error for directory path, got nil")
	}
	if result.Exists {
		t.Error("Expected Exists=false for directory path")
	}
}

func TestRecordingLoader_LoadRecordingWithTranscribeError(t *testing.T) {
	tempDir := t.TempDir()
	videoPath := filepath.Join(tempDir, "test_video.mkv")
	metaPath := filepath.Join(tempDir, "test_video.json")

	err := os.WriteFile(videoPath, []byte("dummy video content"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test video file: %v", err)
	}

	metaContent := `{
		"video_file": "test_video.mkv",
		"duration_ms": 5000,
		"transcribe_error": {
			"message": "API key invalid"
		}
	}`
	err = os.WriteFile(metaPath, []byte(metaContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create test metadata file: %v", err)
	}

	loader := NewRecordingLoader()
	result := loader.LoadRecording(videoPath)

	if result.Error != nil {
		t.Errorf("Unexpected error: %v", result.Error)
	}
	if !result.Exists {
		t.Error("Expected Exists=true for existing file")
	}
	if result.HasTranscription {
		t.Error("Expected HasTranscription=false when transcription had an error")
	}
}
