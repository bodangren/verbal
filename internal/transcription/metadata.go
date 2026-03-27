package transcription

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"verbal/internal/ai"
)

type Metadata struct {
	SourcePath     string                `json:"source_path"`
	TranscriptPath string                `json:"transcript_path"`
	Result         *ai.TranscriptionResult `json:"result,omitempty"`
	CreatedAt      time.Time             `json:"created_at"`
	UpdatedAt      time.Time             `json:"updated_at"`
	Error          string                `json:"error,omitempty"`
}

func NewRecordingMetadata(sourcePath string) *Metadata {
	return &Metadata{
		SourcePath: sourcePath,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
}

func (m *Metadata) SetTranscription(result *ai.TranscriptionResult) {
	m.Result = result
	m.UpdatedAt = time.Now()
}

func (m *Metadata) SetTranscribeError(err error) {
	if err != nil {
		m.Error = err.Error()
	} else {
		m.Error = ""
	}
	m.UpdatedAt = time.Now()
}

func (m *Metadata) Save() error {
	metadataPath := m.SourcePath + ".meta.json"
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	return os.WriteFile(metadataPath, data, 0644)
}

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

func (m *Metadata) GetTranscriptionPath() string {
	if m.TranscriptPath != "" {
		return m.TranscriptPath
	}
	return m.SourcePath + ".transcript.json"
}
