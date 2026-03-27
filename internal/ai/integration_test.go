package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestIntegration_ServiceToOpenAIProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(openAIResponse{
			Text:     "integration test works",
			Language: "en",
			Duration: 2.0,
			Words: []openAIWord{
				{Word: "integration", Start: 0.0, End: 0.5},
				{Word: "test", Start: 0.6, End: 1.0},
				{Word: "works", Start: 1.1, End: 1.5},
			},
		})
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake audio"), 0644)

	provider := NewOpenAIProviderWithClient("key", server.Client())
	provider.baseURL = server.URL

	var _ Provider = provider

	result, err := provider.Transcribe(context.Background(), audioFile)
	if err != nil {
		t.Fatalf("Transcribe failed: %v", err)
	}
	if result.Text != "integration test works" {
		t.Errorf("text = %q, want %q", result.Text, "integration test works")
	}
	if len(result.Words) != 3 {
		t.Errorf("expected 3 words, got %d", len(result.Words))
	}
	if result.Language != "en" {
		t.Errorf("language = %q, want %q", result.Language, "en")
	}
}

func TestIntegration_ServiceToGoogleProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(googleResponse{
			Results: []googleResult{
				{Alternatives: []googleAlternative{
					{
						Transcript: "google integration works",
						Confidence: 0.95,
						Words: []googleWord{
							{Word: "google", StartTime: "0s", EndTime: "0.5s"},
							{Word: "integration", StartTime: "0.6s", EndTime: "1.2s"},
							{Word: "works", StartTime: "1.3s", EndTime: "1.6s"},
						},
					},
				}},
			},
		})
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake audio"), 0644)

	provider := NewGoogleProviderWithClient("key", server.Client())
	provider.baseURL = server.URL

	var _ Provider = provider

	result, err := provider.Transcribe(context.Background(), audioFile)
	if err != nil {
		t.Fatalf("Transcribe failed: %v", err)
	}
	if result.Text != "google integration works" {
		t.Errorf("text = %q, want %q", result.Text, "google integration works")
	}
	if len(result.Words) != 3 {
		t.Errorf("expected 3 words, got %d", len(result.Words))
	}
	if result.Duration != 1.6 {
		t.Errorf("duration = %f, want 1.6", result.Duration)
	}
}

func TestIntegration_ProviderFromEnv(t *testing.T) {
	os.Unsetenv("GOOGLE_API_KEY")
	os.Setenv("OPENAI_API_KEY", "test-key")
	defer os.Unsetenv("OPENAI_API_KEY")

	provider, err := NewProviderFromEnv()
	if err != nil {
		t.Fatalf("NewProviderFromEnv failed: %v", err)
	}
	if provider.Name() != "OpenAI" {
		t.Errorf("expected OpenAI, got %s", provider.Name())
	}

	var _ Provider = provider
}
