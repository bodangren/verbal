package transcription

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"verbal/internal/ai"
)

type mockProvider struct {
	result *ai.TranscriptionResult
	err    error
	name   string
}

func (m *mockProvider) Name() string { return m.name }

func (m *mockProvider) Transcribe(_ context.Context, _ string) (*ai.TranscriptionResult, error) {
	return m.result, m.err
}

func TestAudioExtractionSpecForProvider(t *testing.T) {
	tests := []struct {
		name      string
		provider  ai.Provider
		wantExt   string
		wantEnc   string
		wantLabel string
	}{
		{
			name:      "OpenAI uses FLAC",
			provider:  &mockProvider{name: "OpenAI"},
			wantExt:   ".flac",
			wantEnc:   "flacenc",
			wantLabel: "compressed FLAC",
		},
		{
			name:      "Google keeps WAV",
			provider:  &mockProvider{name: "Google"},
			wantExt:   ".wav",
			wantEnc:   "wavenc",
			wantLabel: "WAV",
		},
		{
			name:      "custom provider keeps WAV",
			provider:  &mockProvider{name: "Mock"},
			wantExt:   ".wav",
			wantEnc:   "wavenc",
			wantLabel: "WAV",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := audioExtractionSpecForProvider(tt.provider)
			if got.extension != tt.wantExt {
				t.Fatalf("extension = %q, want %q", got.extension, tt.wantExt)
			}
			if got.encoder != tt.wantEnc {
				t.Fatalf("encoder = %q, want %q", got.encoder, tt.wantEnc)
			}
			if got.description != tt.wantLabel {
				t.Fatalf("description = %q, want %q", got.description, tt.wantLabel)
			}
		})
	}
}

func TestBuildAudioExtractionCommandUsesGStreamer(t *testing.T) {
	spec := audioExtractionSpec{extension: ".flac", encoder: "flacenc", description: "compressed FLAC"}
	cmd := buildAudioExtractionCommand("/tmp/in put\r\n.mp4", "/tmp/out put.flac", spec)

	if filepath.Base(cmd.Path) != "gst-launch-1.0" {
		t.Fatalf("command = %q, want gst-launch-1.0", cmd.Path)
	}

	joined := strings.Join(cmd.Args, " ")
	required := []string{
		"filesrc",
		"location=/tmp/in put.mp4",
		"decodebin",
		"audioconvert",
		"audioresample",
		"audio/x-raw,format=S16LE,channels=1,rate=16000",
		"flacenc",
		"filesink",
		"location=/tmp/out put.flac",
	}
	for _, token := range required {
		if !strings.Contains(joined, token) {
			t.Fatalf("expected command args to include %q, got %v", token, cmd.Args)
		}
	}
	if strings.Contains(joined, "\n") || strings.Contains(joined, "\r") {
		t.Fatalf("command args should remove newlines: %v", cmd.Args)
	}
}

func TestServiceTranscribeFile_Success(t *testing.T) {
	expected := &ai.TranscriptionResult{
		Text:     "hello world",
		Language: "en",
		Duration: 1.5,
	}
	provider := &mockProvider{result: expected, name: "Mock"}
	svc := NewService(provider)

	result, err := svc.TranscribeFile(context.Background(), "/fake/audio.wav")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Text != "hello world" {
		t.Errorf("expected 'hello world', got '%s'", result.Text)
	}
}

func TestServiceTranscribeFile_Error(t *testing.T) {
	provider := &mockProvider{err: errors.New("api error"), name: "Mock"}
	svc := NewService(provider)

	_, err := svc.TranscribeFile(context.Background(), "/fake/audio.wav")
	if err == nil {
		t.Fatal("expected error")
	}
	if err.Error() != "transcription failed: api error" {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

func TestServiceProgressCallback(t *testing.T) {
	provider := &mockProvider{
		result: &ai.TranscriptionResult{Text: "test"},
		name:   "Mock",
	}
	svc := NewService(provider)

	var progresses []string
	svc.SetProgressCallback(func(msg string) {
		progresses = append(progresses, msg)
	})

	_, err := svc.TranscribeFile(context.Background(), "/fake/audio.wav")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(progresses) != 2 {
		t.Fatalf("expected 2 progress updates, got %d", len(progresses))
	}
	if progresses[0] != "Sending audio.wav to Mock..." {
		t.Errorf("unexpected first progress: %s", progresses[0])
	}
	if progresses[1] != "Transcription complete" {
		t.Errorf("unexpected second progress: %s", progresses[1])
	}
}

func TestIsVideoFile(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		{"video.mp4", true},
		{"video.webm", true},
		{"video.mkv", true},
		{"video.avi", true},
		{"video.mov", true},
		{"audio.wav", false},
		{"audio.mp3", false},
		{"audio.ogg", false},
		{"VIDEO.MP4", true}, // test case insensitivity
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result := isVideoFile(tt.path)
			if result != tt.expected {
				t.Errorf("isVideoFile(%q) = %v, want %v", tt.path, result, tt.expected)
			}
		})
	}
}

func TestMetadataCreate(t *testing.T) {
	m := NewRecordingMetadata("/tmp/test.mkv")
	if m.SourcePath != "/tmp/test.mkv" {
		t.Errorf("unexpected source path: %s", m.SourcePath)
	}
	if m.CreatedAt.IsZero() {
		t.Error("expected non-zero CreatedAt")
	}
	if m.Result != nil {
		t.Error("expected nil Result initially")
	}
}

func TestMetadataSetTranscription(t *testing.T) {
	m := NewRecordingMetadata("/tmp/test.mkv")
	result := &ai.TranscriptionResult{Text: "hello", Language: "en", Duration: 1.0}
	before := m.UpdatedAt
	time.Sleep(time.Millisecond)
	m.SetTranscription(result)
	if m.Result != result {
		t.Error("expected result to be set")
	}
	if !m.UpdatedAt.After(before) {
		t.Error("expected UpdatedAt to advance")
	}
}

func TestMetadataSetTranscribeError(t *testing.T) {
	m := NewRecordingMetadata("/tmp/test.mkv")
	m.SetTranscribeError(errors.New("network error"))
	if m.Error != "network error" {
		t.Errorf("unexpected error: %s", m.Error)
	}
	m.SetTranscribeError(nil)
	if m.Error != "" {
		t.Errorf("expected empty error, got: %s", m.Error)
	}
}

func TestMetadataSaveAndLoad(t *testing.T) {
	tmpDir := t.TempDir()
	sourcePath := filepath.Join(tmpDir, "recording.mkv")

	f, err := os.Create(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	m := NewRecordingMetadata(sourcePath)
	m.SetTranscription(&ai.TranscriptionResult{
		Text:     "test words",
		Language: "en",
		Duration: 2.5,
		Words: []ai.Word{
			{Text: "test", Start: 0.0, End: 0.5},
			{Text: "words", Start: 0.6, End: 1.0},
		},
	})

	if err := m.Save(); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	loaded, err := LoadMetadata(sourcePath)
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if loaded.Result.Text != "test words" {
		t.Errorf("unexpected text: %s", loaded.Result.Text)
	}
}

func TestMetadataLoadNonexistent(t *testing.T) {
	_, err := LoadMetadata("/nonexistent/file.mkv")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestMetadataGetTranscriptionPath(t *testing.T) {
	m := NewRecordingMetadata("/tmp/rec.mkv")
	expected := "/tmp/rec.mkv.transcript.json"
	if got := m.GetTranscriptionPath(); got != expected {
		t.Errorf("expected %s, got %s", expected, got)
	}

	m.TranscriptPath = "/custom/path.txt"
	if got := m.GetTranscriptionPath(); got != "/custom/path.txt" {
		t.Errorf("expected custom path, got %s", got)
	}
}
