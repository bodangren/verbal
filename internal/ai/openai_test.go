package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestNewOpenAIProvider(t *testing.T) {
	tests := []struct {
		name    string
		config  ProviderConfig
		wantErr bool
	}{
		{
			name:    "valid config",
			config:  ProviderConfig{APIKey: "test-key"},
			wantErr: false,
		},
		{
			name:    "missing API key",
			config:  ProviderConfig{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p, err := NewOpenAIProvider(tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewOpenAIProvider() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && p == nil {
				t.Error("expected provider, got nil")
			}
		})
	}
}

func TestOpenAIProvider_Transcribe(t *testing.T) {
	tests := []struct {
		name       string
		response   interface{}
		statusCode int
		wantErr    bool
		errType    error
	}{
		{
			name: "successful transcription",
			response: openAITranscriptionResponse{
				Text:     "hello world",
				Language: "en",
				Duration: 2.5,
				Words: []struct {
					Word  string  `json:"word"`
					Start float64 `json:"start"`
					End   float64 `json:"end"`
				}{
					{Word: "hello", Start: 0.0, End: 0.5},
					{Word: "world", Start: 0.6, End: 1.0},
				},
			},
			statusCode: http.StatusOK,
			wantErr:    false,
		},
		{
			name:       "auth error",
			response:   nil,
			statusCode: http.StatusUnauthorized,
			wantErr:    true,
			errType:    ErrAuthFailed,
		},
		{
			name:       "rate limited",
			response:   nil,
			statusCode: http.StatusTooManyRequests,
			wantErr:    true,
			errType:    ErrRateLimited,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if !strings.Contains(r.URL.Path, "/audio/transcriptions") {
					t.Errorf("unexpected path: %s", r.URL.Path)
				}
				if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
					t.Error("missing Authorization header")
				}
				if r.Method != "POST" {
					t.Errorf("expected POST, got %s", r.Method)
				}

				w.WriteHeader(tt.statusCode)
				if tt.response != nil {
					json.NewEncoder(w).Encode(tt.response)
				}
			}))
			defer server.Close()

			p, _ := NewOpenAIProvider(ProviderConfig{
				APIKey:   "test-key",
				Endpoint: server.URL,
			})

			result, err := p.Transcribe(context.Background(), []byte("fake audio"), TranscriptionOptions{
				EnableTimestamps: true,
			})

			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				if tt.errType != nil && !isErrType(err, tt.errType) {
					t.Errorf("expected error type %v, got %v", tt.errType, err)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
				if result.Text != "hello world" {
					t.Errorf("expected text 'hello world', got %q", result.Text)
				}
				if len(result.Words) != 2 {
					t.Errorf("expected 2 words, got %d", len(result.Words))
				}
			}
		})
	}
}

func TestOpenAIProvider_TranscribeFile(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(openAITranscriptionResponse{
			Text:     "file transcription",
			Language: "en",
			Duration: 5.0,
		})
	}))
	defer server.Close()

	p, _ := NewOpenAIProvider(ProviderConfig{
		APIKey:   "test-key",
		Endpoint: server.URL,
	})

	tmpFile := t.TempDir() + "/test.mp3"
	if err := writeFakeAudio(tmpFile); err != nil {
		t.Fatal(err)
	}

	result, err := p.TranscribeFile(context.Background(), tmpFile, TranscriptionOptions{})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if result.Text != "file transcription" {
		t.Errorf("expected 'file transcription', got %q", result.Text)
	}
}

func TestOpenAIProvider_IsAvailable(t *testing.T) {
	p, _ := NewOpenAIProvider(ProviderConfig{APIKey: "key"})
	if !p.IsAvailable() {
		t.Error("expected IsAvailable to be true")
	}
}

func TestOpenAIProvider_Name(t *testing.T) {
	p, _ := NewOpenAIProvider(ProviderConfig{APIKey: "key"})
	if p.Name() != "openai" {
		t.Errorf("expected name 'openai', got %q", p.Name())
	}
}

func TestParseRetryAfter(t *testing.T) {
	tests := []struct {
		input string
		want  time.Duration
	}{
		{"30", 30 * time.Second},
		{"", 30 * time.Second},
		{"invalid", 30 * time.Second},
		{"60", 60 * time.Second},
	}

	for _, tt := range tests {
		got := parseRetryAfter(tt.input)
		if got != tt.want {
			t.Errorf("parseRetryAfter(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func isErrType(err, target error) bool {
	for err != nil {
		if err == target {
			return true
		}
		if unwrapper, ok := err.(interface{ Unwrap() error }); ok {
			err = unwrapper.Unwrap()
		} else {
			break
		}
	}
	return false
}

func writeFakeAudio(path string) error {
	return os.WriteFile(path, []byte("fake audio data"), 0644)
}
