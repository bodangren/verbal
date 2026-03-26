package transcription

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"verbal/internal/ai"
)

type RecordingMetadata struct {
	FilePath        string                  `json:"file_path"`
	CreatedAt       time.Time               `json:"created_at"`
	Duration        float64                 `json:"duration"`
	Transcription   *ai.TranscriptionResult `json:"transcription,omitempty"`
	TranscribedAt   time.Time               `json:"transcribed_at,omitempty"`
	TranscribeError string                  `json:"transcribe_error,omitempty"`
}

func NewRecordingMetadata(filePath string) *RecordingMetadata {
	return &RecordingMetadata{
		FilePath:  filePath,
		CreatedAt: time.Now(),
	}
}

func (m *RecordingMetadata) SetTranscription(result *ai.TranscriptionResult) {
	m.Transcription = result
	m.TranscribedAt = time.Now()
	m.Duration = result.Duration
}

func (m *RecordingMetadata) SetTranscribeError(err error) {
	m.TranscribeError = err.Error()
}

func (m *RecordingMetadata) Save() error {
	metaPath := m.FilePath + ".meta.json"
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(metaPath, data, 0644)
}

func LoadRecordingMetadata(filePath string) (*RecordingMetadata, error) {
	metaPath := filePath + ".meta.json"
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, err
	}
	var meta RecordingMetadata
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

func (m *RecordingMetadata) HasTranscription() bool {
	return m.Transcription != nil
}

func GetRecordingsWithTranscriptions(dir string) ([]*RecordingMetadata, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var recordings []*RecordingMetadata
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) == ".webm" {
			filePath := filepath.Join(dir, entry.Name())
			meta, err := LoadRecordingMetadata(filePath)
			if err != nil {
				meta = NewRecordingMetadata(filePath)
			}
			recordings = append(recordings, meta)
		}
	}
	return recordings, nil
}
