package ui

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"verbal/internal/ai"
)

// RecordingLoaderResult contains the result of loading a recording with its metadata.
type RecordingLoaderResult struct {
	VideoPath        string
	MetadataPath     string
	Exists           bool
	Duration         float64 // Duration in seconds
	HasTranscription bool
	Transcription    *ai.TranscriptionResult
	WordData         []WordData
	Error            error
}

// RecordingLoader handles loading recordings and their associated metadata.
type RecordingLoader struct{}

// NewRecordingLoader creates a new recording loader.
func NewRecordingLoader() *RecordingLoader {
	return &RecordingLoader{}
}

// LoadRecording loads a recording file and its associated metadata if available.
// It returns a RecordingLoaderResult containing the video path, metadata path,
// and transcription data (if available).
//
// The metadata file is expected to be in the same directory as the video file
// with the same name but a .json extension.
func (rl *RecordingLoader) LoadRecording(videoPath string) *RecordingLoaderResult {
	result := &RecordingLoaderResult{
		VideoPath: videoPath,
	}

	// Check if the video file exists
	info, err := os.Stat(videoPath)
	if err != nil {
		if os.IsNotExist(err) {
			result.Error = fmt.Errorf("video file not found: %s", videoPath)
			return result
		}
		result.Error = fmt.Errorf("failed to stat video file: %w", err)
		return result
	}

	if info.IsDir() {
		result.Error = fmt.Errorf("path is a directory, not a file: %s", videoPath)
		return result
	}

	result.Exists = true

	// Look for metadata file
	metaPath := rl.GetMetadataPath(videoPath)
	result.MetadataPath = metaPath

	// Try to load metadata
	metaData, err := os.ReadFile(metaPath)
	if err != nil {
		// No metadata file is not an error - just means no transcription
		return result
	}

	// Parse metadata
	var metadata struct {
		VideoFile     string `json:"video_file"`
		DurationMs    int64  `json:"duration_ms"`
		Transcription *struct {
			Text  string    `json:"text"`
			Words []ai.Word `json:"words"`
		} `json:"transcription"`
		TranscribeError *struct {
			Message string `json:"message"`
		} `json:"transcribe_error"`
	}

	if err := json.Unmarshal(metaData, &metadata); err != nil {
		// Corrupted metadata - log but don't fail
		return result
	}

	// Check if there's a transcription error
	if metadata.TranscribeError != nil {
		// Previous transcription failed - still not an error for loading
		return result
	}

	// Check if transcription data exists
	if metadata.Transcription == nil {
		return result
	}

	// Create TranscriptionResult
	result.HasTranscription = true
	result.Transcription = &ai.TranscriptionResult{
		Text:  metadata.Transcription.Text,
		Words: metadata.Transcription.Words,
	}

	// Set duration from metadata (convert ms to seconds)
	result.Duration = float64(metadata.DurationMs) / 1000.0

	// Convert to WordData for UI
	result.WordData = wordsToWordData(metadata.Transcription.Words)

	return result
}

// GetMetadataPath returns the expected metadata file path for a given video file.
// The metadata file is the video file path with the extension changed to .json.
func (rl *RecordingLoader) GetMetadataPath(videoPath string) string {
	ext := filepath.Ext(videoPath)
	base := strings.TrimSuffix(videoPath, ext)
	return base + ".json"
}

// wordsToWordData converts AI Word structs to UI WordData.
func wordsToWordData(words []ai.Word) []WordData {
	result := make([]WordData, len(words))
	for i, word := range words {
		result[i] = WordData{
			Text:      word.Text,
			StartTime: word.Start,
			Index:     i,
		}
	}
	return result
}
