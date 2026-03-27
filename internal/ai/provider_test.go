package ai

import (
	"context"
	"os"
	"testing"
)

func TestNewOpenAIProvider(t *testing.T) {
	p := NewOpenAIProvider("test-key")
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
	if p.Name() != "OpenAI" {
		t.Errorf("expected name OpenAI, got %s", p.Name())
	}
}

func TestNewGoogleProvider(t *testing.T) {
	p := NewGoogleProvider("test-key")
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
	if p.Name() != "Google" {
		t.Errorf("expected name Google, got %s", p.Name())
	}
}

func TestOpenAIProviderTranscribeFileNotFound(t *testing.T) {
	p := NewOpenAIProvider("test-key")
	_, err := p.Transcribe(context.Background(), "/nonexistent/audio.wav")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestGoogleProviderTranscribeFileNotFound(t *testing.T) {
	p := NewGoogleProvider("test-key")
	_, err := p.Transcribe(context.Background(), "/nonexistent/audio.wav")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestNewProviderFromEnv_NoCredentials(t *testing.T) {
	os.Unsetenv("OPENAI_API_KEY")
	os.Unsetenv("GOOGLE_API_KEY")
	_, err := NewProviderFromEnv()
	if err == nil {
		t.Error("expected error when no credentials set")
	}
}

func TestNewProviderFromEnv_OpenAI(t *testing.T) {
	os.Unsetenv("GOOGLE_API_KEY")
	os.Setenv("OPENAI_API_KEY", "test-openai-key")
	defer os.Unsetenv("OPENAI_API_KEY")

	p, err := NewProviderFromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "OpenAI" {
		t.Errorf("expected OpenAI provider, got %s", p.Name())
	}
}

func TestNewProviderFromEnv_Google(t *testing.T) {
	os.Unsetenv("OPENAI_API_KEY")
	os.Setenv("GOOGLE_API_KEY", "test-google-key")
	defer os.Unsetenv("GOOGLE_API_KEY")

	p, err := NewProviderFromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "Google" {
		t.Errorf("expected Google provider, got %s", p.Name())
	}
}

func TestNewProviderFromEnv_OpenAITakesPrecedence(t *testing.T) {
	os.Setenv("OPENAI_API_KEY", "test-openai-key")
	os.Setenv("GOOGLE_API_KEY", "test-google-key")
	defer os.Unsetenv("OPENAI_API_KEY")
	defer os.Unsetenv("GOOGLE_API_KEY")

	p, err := NewProviderFromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "OpenAI" {
		t.Errorf("expected OpenAI to take precedence, got %s", p.Name())
	}
}

func TestTranscriptionResultTypes(t *testing.T) {
	result := &TranscriptionResult{
		Text:     "hello world",
		Language: "en",
		Duration: 5.2,
		Words: []Word{
			{Text: "hello", Start: 0.0, End: 0.5},
			{Text: "world", Start: 0.6, End: 1.0},
		},
	}
	if result.Text != "hello world" {
		t.Errorf("unexpected text: %s", result.Text)
	}
	if len(result.Words) != 2 {
		t.Errorf("expected 2 words, got %d", len(result.Words))
	}
	if result.Words[0].Start != 0.0 {
		t.Errorf("unexpected start time: %f", result.Words[0].Start)
	}
}

func TestProviderInterface(t *testing.T) {
	var _ Provider = NewOpenAIProvider("key")
	var _ Provider = NewGoogleProvider("key")
}
