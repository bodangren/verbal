package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestGoogleTranscribe_Success(t *testing.T) {
	response := googleResponse{
		Results: []googleResult{
			{
				Alternatives: []googleAlternative{
					{
						Transcript: "Hello world from Google",
						Confidence: 0.98,
						Words: []googleWord{
							{Word: "Hello", StartTime: "0s", EndTime: "0.5s"},
							{Word: "world", StartTime: "0.6s", EndTime: "1.0s"},
							{Word: "from", StartTime: "1.1s", EndTime: "1.3s"},
							{Word: "Google", StartTime: "1.4s", EndTime: "1.8s"},
						},
					},
				},
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Query().Get("key") != "test-google-key" {
			t.Errorf("expected key param, got %s", r.URL.Query().Get("key"))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake audio data"), 0644)

	provider := NewGoogleProviderWithClient("test-google-key", server.Client())
	provider.baseURL = server.URL

	result, err := provider.Transcribe(context.Background(), audioFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Text != "Hello world from Google" {
		t.Errorf("text = %q, want %q", result.Text, "Hello world from Google")
	}
	if len(result.Words) != 4 {
		t.Fatalf("words count = %d, want 4", len(result.Words))
	}
	if result.Words[0].Text != "Hello" {
		t.Errorf("first word = %q, want Hello", result.Words[0].Text)
	}
	if result.Words[0].Start != 0.0 {
		t.Errorf("first word start = %f, want 0.0", result.Words[0].Start)
	}
	if result.Words[1].Start != 0.6 {
		t.Errorf("second word start = %f, want 0.6", result.Words[1].Start)
	}
}

func TestGoogleTranscribe_AuthError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]string{"message": "invalid API key", "status": "INVALID_ARGUMENT"},
		})
	}))
	defer server.Close()

	provider := NewGoogleProviderWithClient("bad-key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 0

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected error for 401")
	}

	var authErr *AuthError
	if !errors.As(err, &authErr) {
		t.Errorf("expected AuthError, got %T: %v", err, err)
	}
}

func TestGoogleTranscribe_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
	}))
	defer server.Close()

	provider := NewGoogleProviderWithClient("key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 0

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	_, err := provider.Transcribe(context.Background(), audioFile)
	if err == nil {
		t.Fatal("expected error for 500")
	}

	var serverErr *ServerError
	if !errors.As(err, &serverErr) {
		t.Errorf("expected ServerError, got %T: %v", err, err)
	}
}

func TestGoogleTranscribe_FileNotFound(t *testing.T) {
	provider := NewGoogleProvider("key")
	_, err := provider.Transcribe(context.Background(), "/nonexistent/file.wav")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestGoogleTranscribe_RetryOn429ThenSuccess(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if callCount <= 1 {
			w.WriteHeader(429)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(googleResponse{
			Results: []googleResult{
				{Alternatives: []googleAlternative{
					{Transcript: "retried", Words: []googleWord{
						{Word: "retried", StartTime: "0s", EndTime: "1s"},
					}},
				}},
			},
		})
	}))
	defer server.Close()

	provider := NewGoogleProviderWithClient("key", server.Client())
	provider.baseURL = server.URL
	provider.maxRetries = 3

	tmpDir := t.TempDir()
	audioFile := filepath.Join(tmpDir, "test.wav")
	os.WriteFile(audioFile, []byte("fake"), 0644)

	result, err := provider.Transcribe(context.Background(), audioFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Text != "retried" {
		t.Errorf("text = %q, want retried", result.Text)
	}
	if callCount != 2 {
		t.Errorf("expected 2 calls, got %d", callCount)
	}
}

func TestGoogleTranscribe_ParseDuration(t *testing.T) {
	tests := []struct {
		input    string
		expected float64
	}{
		{"0s", 0.0},
		{"1s", 1.0},
		{"1.5s", 1.5},
		{"0.100s", 0.1},
		{"2.300s", 2.3},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseGoogleDuration(tt.input)
			if got != tt.expected {
				t.Errorf("parseGoogleDuration(%q) = %f, want %f", tt.input, got, tt.expected)
			}
		})
	}
}
