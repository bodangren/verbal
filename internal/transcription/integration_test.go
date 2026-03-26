package transcription

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"verbal/internal/ai"
)

type integrationMockProvider struct {
	result *ai.TranscriptionResult
}

func (m *integrationMockProvider) Transcribe(ctx context.Context, audioData []byte, opts ai.TranscriptionOptions) (*ai.TranscriptionResult, error) {
	return m.result, nil
}

func (m *integrationMockProvider) TranscribeFile(ctx context.Context, filePath string, opts ai.TranscriptionOptions) (*ai.TranscriptionResult, error) {
	return m.result, nil
}

func (m *integrationMockProvider) IsAvailable() bool {
	return true
}

func (m *integrationMockProvider) Name() string {
	return "integration-mock"
}

func TestIntegration_TranscribeAndSaveMetadata(t *testing.T) {
	tmpDir := t.TempDir()

	audioFile := filepath.Join(tmpDir, "recording.webm")
	if err := os.WriteFile(audioFile, []byte("fake audio"), 0644); err != nil {
		t.Fatal(err)
	}

	provider := &integrationMockProvider{
		result: &ai.TranscriptionResult{
			Text:     "Hello, this is a test transcription",
			Language: "en",
			Duration: 5.0,
			Provider: "integration-mock",
			Words: []ai.WordTimestamp{
				{Word: "Hello", Start: 0.0, End: 0.5, Confidence: 0.95},
				{Word: "this", Start: 0.6, End: 0.8, Confidence: 0.98},
				{Word: "is", Start: 0.9, End: 1.0, Confidence: 0.99},
				{Word: "a", Start: 1.1, End: 1.2, Confidence: 0.97},
				{Word: "test", Start: 1.3, End: 1.6, Confidence: 0.96},
				{Word: "transcription", Start: 1.7, End: 2.5, Confidence: 0.94},
			},
		},
	}

	svc := NewService(provider)

	var progressStatuses []string
	svc.SetProgressCallback(func(status string) {
		progressStatuses = append(progressStatuses, status)
	})

	result, err := svc.TranscribeFile(context.Background(), audioFile)
	if err != nil {
		t.Fatalf("TranscribeFile failed: %v", err)
	}

	meta := NewRecordingMetadata(audioFile)
	meta.SetTranscription(result)
	if err := meta.Save(); err != nil {
		t.Fatalf("Save metadata failed: %v", err)
	}

	loaded, err := LoadRecordingMetadata(audioFile)
	if err != nil {
		t.Fatalf("LoadRecordingMetadata failed: %v", err)
	}

	if loaded.Transcription.Text != result.Text {
		t.Errorf("expected text %q, got %q", result.Text, loaded.Transcription.Text)
	}

	if len(loaded.Transcription.Words) != 6 {
		t.Errorf("expected 6 words, got %d", len(loaded.Transcription.Words))
	}

	if len(progressStatuses) == 0 {
		t.Error("expected progress callbacks")
	}

	if !loaded.HasTranscription() {
		t.Error("metadata should indicate transcription exists")
	}
}

func TestIntegration_TranscribeErrorSavesMetadata(t *testing.T) {
	tmpDir := t.TempDir()

	audioFile := filepath.Join(tmpDir, "recording.webm")
	if err := os.WriteFile(audioFile, []byte("fake audio"), 0644); err != nil {
		t.Fatal(err)
	}

	meta := NewRecordingMetadata(audioFile)
	testErr := ai.ErrAuthFailed
	meta.SetTranscribeError(testErr)

	if err := meta.Save(); err != nil {
		t.Fatalf("Save metadata failed: %v", err)
	}

	loaded, err := LoadRecordingMetadata(audioFile)
	if err != nil {
		t.Fatalf("LoadRecordingMetadata failed: %v", err)
	}

	if loaded.TranscribeError != testErr.Error() {
		t.Errorf("expected error %q, got %q", testErr.Error(), loaded.TranscribeError)
	}

	if loaded.HasTranscription() {
		t.Error("metadata should not indicate transcription exists")
	}
}
