package transcription

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"verbal/internal/ai"
)

// Metadata stores information about a recording and its transcription.
// It is saved alongside the recording file as a JSON metadata file.
type Metadata struct {
	SourcePath     string                  `json:"source_path"`      // Path to the source media file
	TranscriptPath string                  `json:"transcript_path"`  // Path to the transcript file (if exported separately)
	Result         *ai.TranscriptionResult `json:"result,omitempty"` // Transcription result
	CreatedAt      time.Time               `json:"created_at"`       // When the recording was created
	UpdatedAt      time.Time               `json:"updated_at"`       // When the metadata was last modified
	Error          string                  `json:"error,omitempty"`  // Any error that occurred during transcription
}

// NewRecordingMetadata creates metadata for a new recording.
// Sets CreatedAt and UpdatedAt to the current time.
func NewRecordingMetadata(sourcePath string) *Metadata {
	return &Metadata{
		SourcePath: sourcePath,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
}

// SetTranscription stores the transcription result and updates the timestamp.
func (m *Metadata) SetTranscription(result *ai.TranscriptionResult) {
	m.Result = result
	m.UpdatedAt = time.Now()
}

// SetTranscribeError records an error that occurred during transcription.
// Pass nil to clear any previous error.
func (m *Metadata) SetTranscribeError(err error) {
	if err != nil {
		m.Error = err.Error()
	} else {
		m.Error = ""
	}
	m.UpdatedAt = time.Now()
}

// Save writes the metadata to a JSON file next to the source recording.
// The metadata file has the same name as the source with ".meta.json" appended.
func (m *Metadata) Save() error {
	metadataPath := m.SourcePath + ".meta.json"
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	return os.WriteFile(metadataPath, data, 0644)
}

// LoadMetadata reads metadata from the JSON file associated with the source path.
// Returns an error if the metadata file doesn't exist or is invalid.
func LoadMetadata(sourcePath string) (*Metadata, error) {
	metadataPath := sourcePath + ".meta.json"
	data, err := os.ReadFile(metadataPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read metadata file: %w", err)
	}

	var m Metadata
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("failed to unmarshal metadata: %w", err)
	}

	return &m, nil
}

// GetTranscriptionPath returns the path where the transcript should be saved.
// If TranscriptPath is set, it returns that; otherwise it generates a path
// based on the source path with ".transcript.json" appended.
func (m *Metadata) GetTranscriptionPath() string {
	if m.TranscriptPath != "" {
		return m.TranscriptPath
	}
	return m.SourcePath + ".transcript.json"
}
