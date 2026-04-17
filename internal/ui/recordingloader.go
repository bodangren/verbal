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

	metaPath := rl.GetMetadataPath(videoPath)
	result.MetadataPath = metaPath

	if rl.loadCurrentMetadata(result, metaPath) {
		return result
	}

	legacyPath := rl.GetLegacyMetadataPath(videoPath)
	result.MetadataPath = legacyPath
	rl.loadLegacyMetadata(result, legacyPath)
	return result
}

func (rl *RecordingLoader) loadCurrentMetadata(result *RecordingLoaderResult, metaPath string) bool {
	metaData, err := os.ReadFile(metaPath)
	if err != nil {
		return false
	}

	var metadata struct {
		Result *ai.TranscriptionResult `json:"result"`
		Error  string                  `json:"error"`
	}

	if err := json.Unmarshal(metaData, &metadata); err != nil {
		return true
	}

	if metadata.Error != "" || metadata.Result == nil {
		return true
	}

	result.HasTranscription = true
	result.Transcription = metadata.Result
	result.Duration = metadata.Result.Duration
	result.WordData = wordsToWordData(metadata.Result.Words)
	return true
}

func (rl *RecordingLoader) loadLegacyMetadata(result *RecordingLoaderResult, metaPath string) bool {
	metaData, err := os.ReadFile(metaPath)
	if err != nil {
		return false
	}

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
		return true
	}

	if metadata.TranscribeError != nil {
		return true
	}

	if metadata.Transcription == nil {
		return true
	}

	result.HasTranscription = true
	result.Transcription = &ai.TranscriptionResult{
		Text:  metadata.Transcription.Text,
		Words: metadata.Transcription.Words,
	}

	// Set duration from metadata (convert ms to seconds)
	result.Duration = float64(metadata.DurationMs) / 1000.0

	// Convert to WordData for UI
	result.WordData = wordsToWordData(metadata.Transcription.Words)

	return true
}

// GetMetadataPath returns the expected metadata file path for a given video file.
// The metadata file is the video file path with ".meta.json" appended.
func (rl *RecordingLoader) GetMetadataPath(videoPath string) string {
	return videoPath + ".meta.json"
}

// GetLegacyMetadataPath returns the pre-database metadata path used by early builds.
func (rl *RecordingLoader) GetLegacyMetadataPath(videoPath string) string {
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
			EndTime:   word.End,
			Index:     i,
		}
	}
	return result
}
