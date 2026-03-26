package transcription

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"verbal/internal/ai"
)

func TestRecordingMetadata_New(t *testing.T) {
	meta := NewRecordingMetadata("/tmp/test.webm")
	if meta.FilePath != "/tmp/test.webm" {
		t.Errorf("expected /tmp/test.webm, got %q", meta.FilePath)
	}
	if meta.CreatedAt.IsZero() {
		t.Error("CreatedAt should be set")
	}
}

func TestRecordingMetadata_SetTranscription(t *testing.T) {
	meta := NewRecordingMetadata("/tmp/test.webm")
	result := &ai.TranscriptionResult{
		Text:     "Hello world",
		Duration: 5.5,
		Language: "en",
	}

	meta.SetTranscription(result)

	if meta.Transcription == nil {
		t.Fatal("Transcription should not be nil")
	}
	if meta.Transcription.Text != "Hello world" {
		t.Errorf("expected 'Hello world', got %q", meta.Transcription.Text)
	}
	if meta.Duration != 5.5 {
		t.Errorf("expected 5.5, got %f", meta.Duration)
	}
	if meta.TranscribedAt.IsZero() {
		t.Error("TranscribedAt should be set")
	}
}

func TestRecordingMetadata_SetTranscribeError(t *testing.T) {
	meta := NewRecordingMetadata("/tmp/test.webm")
	meta.SetTranscribeError(errors.New("test error"))

	if meta.TranscribeError != "test error" {
		t.Errorf("expected 'test error', got %q", meta.TranscribeError)
	}
}

func TestRecordingMetadata_HasTranscription(t *testing.T) {
	meta := NewRecordingMetadata("/tmp/test.webm")

	if meta.HasTranscription() {
		t.Error("empty metadata should not have transcription")
	}

	meta.SetTranscription(&ai.TranscriptionResult{Text: "test"})
	if !meta.HasTranscription() {
		t.Error("should have transcription after SetTranscription")
	}
}

func TestRecordingMetadata_SaveAndLoad(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "test.webm")

	meta := NewRecordingMetadata(filePath)
	meta.SetTranscription(&ai.TranscriptionResult{
		Text:     "Hello world",
		Duration: 5.5,
		Language: "en",
		Provider: "test",
	})

	if err := meta.Save(); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := LoadRecordingMetadata(filePath)
	if err != nil {
		t.Fatalf("LoadRecordingMetadata failed: %v", err)
	}

	if loaded.Transcription.Text != meta.Transcription.Text {
		t.Errorf("expected Transcription.Text %q, got %q", meta.Transcription.Text, loaded.Transcription.Text)
	}
	if loaded.Duration != 5.5 {
		t.Errorf("expected Duration 5.5, got %f", loaded.Duration)
	}
}

func TestLoadRecordingMetadata_NotFound(t *testing.T) {
	_, err := LoadRecordingMetadata("/nonexistent/file.webm")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestGetRecordingsWithTranscriptions(t *testing.T) {
	tmpDir := t.TempDir()

	recording1 := filepath.Join(tmpDir, "recording1.webm")
	if err := os.WriteFile(recording1, []byte("fake video"), 0644); err != nil {
		t.Fatal(err)
	}
	meta1 := NewRecordingMetadata(recording1)
	meta1.SetTranscription(&ai.TranscriptionResult{Text: "first recording"})
	if err := meta1.Save(); err != nil {
		t.Fatal(err)
	}

	recording2 := filepath.Join(tmpDir, "recording2.webm")
	if err := os.WriteFile(recording2, []byte("fake video"), 0644); err != nil {
		t.Fatal(err)
	}
	meta2 := NewRecordingMetadata(recording2)

	_ = meta2

	recordings, err := GetRecordingsWithTranscriptions(tmpDir)
	if err != nil {
		t.Fatalf("GetRecordingsWithTranscriptions failed: %v", err)
	}

	if len(recordings) != 2 {
		t.Errorf("expected 2 recordings, got %d", len(recordings))
	}

	transcribed := 0
	for _, r := range recordings {
		if r.HasTranscription() {
			transcribed++
		}
	}
	if transcribed != 1 {
		t.Errorf("expected 1 transcribed recording, got %d", transcribed)
	}
}
