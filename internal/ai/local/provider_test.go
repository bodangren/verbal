package local

import (
	"context"
	"os"
	"testing"
)

func TestNewLocalProvider(t *testing.T) {
	p := NewLocalProvider("/path/to/model.bin")
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
	if p.modelPath != "/path/to/model.bin" {
		t.Errorf("expected model path /path/to/model.bin, got %s", p.modelPath)
	}
}

func TestNewLocalProviderWithSize(t *testing.T) {
	p := NewLocalProviderWithSize("/path/to/model.bin", ModelSmall)
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
	if p.modelPath != "/path/to/model.bin" {
		t.Errorf("expected model path /path/to/model.bin, got %s", p.modelPath)
	}
	if p.modelSize != ModelSmall {
		t.Errorf("expected model size small, got %s", p.modelSize)
	}
}

func TestLocalProvider_Name(t *testing.T) {
	p := NewLocalProviderWithSize("/path/to/ggml-base.bin", ModelBase)
	expected := "Local Whisper (base)"
	if got := p.Name(); got != expected {
		t.Errorf("expected name %s, got %s", expected, got)
	}
}

func TestLocalProvider_Transcribe_FileNotFound(t *testing.T) {
	p := NewLocalProvider("/nonexistent/model.bin")
	ctx := context.Background()
	_, err := p.Transcribe(ctx, "/path/to/audio.wav")
	if err == nil {
		t.Fatal("expected error for nonexistent model file")
	}
}

func TestLocalProvider_Transcribe_ModelNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	modelPath := tmpDir + "/model.bin"

	p := NewLocalProvider(modelPath)
	ctx := context.Background()
	_, err := p.Transcribe(ctx, "/path/to/audio.wav")
	if err == nil {
		t.Fatal("expected error for missing model file")
	}
	expectedPrefix := "model file not found"
	if err.Error()[:len(expectedPrefix)] != expectedPrefix {
		t.Errorf("expected error starting with %s, got %s", expectedPrefix, err.Error())
	}
}

func TestModelSize_URL(t *testing.T) {
	tests := []struct {
		size     ModelSize
		expected string
	}{
		{ModelTiny, "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"},
		{ModelBase, "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"},
		{ModelSmall, "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"},
		{ModelMedium, "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"},
		{ModelLarge, "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large.bin"},
	}

	for _, tt := range tests {
		if got := tt.size.URL(); got != tt.expected {
			t.Errorf("ModelSize(%s).URL() = %s, want %s", tt.size, got, tt.expected)
		}
	}
}

func TestModelSize_String(t *testing.T) {
	size := ModelSmall
	if got := size.String(); got != "small" {
		t.Errorf("ModelSize.String() = %s, want small", got)
	}
}

func TestGuessModelSize(t *testing.T) {
	tests := []struct {
		path     string
		expected ModelSize
	}{
		{"/path/to/ggml-tiny.bin", ModelTiny},
		{"/path/to/ggml-base.bin", ModelBase},
		{"/path/to/ggml-small.bin", ModelSmall},
		{"/path/to/ggml-medium.bin", ModelMedium},
		{"/path/to/ggml-large.bin", ModelLarge},
		{"/path/to/model.bin", ModelBase},
	}

	for _, tt := range tests {
		if got := guessModelSize(tt.path); got != tt.expected {
			t.Errorf("guessModelSize(%s) = %s, want %s", tt.path, got, tt.expected)
		}
	}
}

func TestModelPathForSize(t *testing.T) {
	dir := "/models"
	path := ModelPathForSize(dir, ModelSmall)
	expected := "/models/ggml-small.bin"
	if path != expected {
		t.Errorf("ModelPathForSize(%s, ModelSmall) = %s, want %s", dir, path, expected)
	}
}

func TestLocalProvider_ValidateModel_EmptyFile(t *testing.T) {
	tmpDir := t.TempDir()
	modelPath := tmpDir + "/empty.bin"

	if err := os.WriteFile(modelPath, []byte{}, 0644); err != nil {
		t.Fatalf("failed to create empty file: %v", err)
	}

	p := NewLocalProvider(modelPath)
	err := p.validateModel()
	if err == nil {
		t.Fatal("expected error for empty model file")
	}
	if err.Error() != "model file is empty" {
		t.Errorf("expected 'model file is empty', got %s", err.Error())
	}
}

func TestContains(t *testing.T) {
	if !contains("hello world", "world") {
		t.Error("expected contains to return true")
	}
	if contains("hello world", "xyz") {
		t.Error("expected contains to return false")
	}
}

func TestProviderInterface(t *testing.T) {
	var p Provider = NewLocalProvider("/path/to/model.bin")
	_ = p
}