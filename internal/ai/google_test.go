package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestNewGoogleProvider(t *testing.T) {
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
			p, err := NewGoogleProvider(tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewGoogleProvider() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && p == nil {
				t.Error("expected provider, got nil")
			}
		})
	}
}

func TestGoogleProvider_Transcribe(t *testing.T) {
	tests := []struct {
		name       string
		response   googleRecognizeResponse
		statusCode int
		wantErr    bool
		errType    error
		wantText   string
		wantWords  int
	}{
		{
			name: "successful transcription with words",
			response: googleRecognizeResponse{
				Results: []struct {
					Alternatives []struct {
						Transcript string  `json:"transcript"`
						Confidence float64 `json:"confidence"`
						Words      []struct {
							Word       string  `json:"word"`
							StartTime  string  `json:"startTime"`
							EndTime    string  `json:"endTime"`
							Confidence float64 `json:"confidence,omitempty"`
						} `json:"words"`
					} `json:"alternatives"`
				}{
					{
						Alternatives: []struct {
							Transcript string  `json:"transcript"`
							Confidence float64 `json:"confidence"`
							Words      []struct {
								Word       string  `json:"word"`
								StartTime  string  `json:"startTime"`
								EndTime    string  `json:"endTime"`
								Confidence float64 `json:"confidence,omitempty"`
							} `json:"words"`
						}{
							{
								Transcript: "hello world",
								Confidence: 0.95,
								Words: []struct {
									Word       string  `json:"word"`
									StartTime  string  `json:"startTime"`
									EndTime    string  `json:"endTime"`
									Confidence float64 `json:"confidence,omitempty"`
								}{
									{Word: "hello", StartTime: "0s", EndTime: "0.5s"},
									{Word: "world", StartTime: "0.6s", EndTime: "1s"},
								},
							},
						},
					},
				},
			},
			statusCode: http.StatusOK,
			wantErr:    false,
			wantText:   "hello world",
			wantWords:  2,
		},
		{
			name:       "auth error",
			response:   googleRecognizeResponse{},
			statusCode: http.StatusUnauthorized,
			wantErr:    true,
			errType:    ErrAuthFailed,
		},
		{
			name:       "rate limited",
			response:   googleRecognizeResponse{},
			statusCode: http.StatusTooManyRequests,
			wantErr:    true,
			errType:    ErrRateLimited,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if !strings.Contains(r.URL.Path, "speech:recognize") {
					t.Errorf("unexpected path: %s", r.URL.Path)
				}
				if r.Method != "POST" {
					t.Errorf("expected POST, got %s", r.Method)
				}

				w.WriteHeader(tt.statusCode)
				if tt.statusCode == http.StatusOK {
					json.NewEncoder(w).Encode(tt.response)
				}
			}))
			defer server.Close()

			p, _ := NewGoogleProvider(ProviderConfig{
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
				if result.Text != tt.wantText {
					t.Errorf("expected text %q, got %q", tt.wantText, result.Text)
				}
				if len(result.Words) != tt.wantWords {
					t.Errorf("expected %d words, got %d", tt.wantWords, len(result.Words))
				}
			}
		})
	}
}

func TestGoogleProvider_TranscribeFile(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req googleRecognizeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("failed to decode request: %v", err)
		}
		if req.Audio.Content == "" {
			t.Error("expected audio content")
		}
		if _, err := base64.StdEncoding.DecodeString(req.Audio.Content); err != nil {
			t.Errorf("invalid base64 content: %v", err)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(googleRecognizeResponse{
			Results: []struct {
				Alternatives []struct {
					Transcript string  `json:"transcript"`
					Confidence float64 `json:"confidence"`
					Words      []struct {
						Word       string  `json:"word"`
						StartTime  string  `json:"startTime"`
						EndTime    string  `json:"endTime"`
						Confidence float64 `json:"confidence,omitempty"`
					} `json:"words"`
				} `json:"alternatives"`
			}{
				{
					Alternatives: []struct {
						Transcript string  `json:"transcript"`
						Confidence float64 `json:"confidence"`
						Words      []struct {
							Word       string  `json:"word"`
							StartTime  string  `json:"startTime"`
							EndTime    string  `json:"endTime"`
							Confidence float64 `json:"confidence,omitempty"`
						} `json:"words"`
					}{
						{Transcript: "file transcription"},
					},
				},
			},
		})
	}))
	defer server.Close()

	p, _ := NewGoogleProvider(ProviderConfig{
		APIKey:   "test-key",
		Endpoint: server.URL,
	})

	tmpFile := t.TempDir() + "/test.wav"
	if err := os.WriteFile(tmpFile, []byte("fake audio data"), 0644); err != nil {
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

func TestGoogleProvider_IsAvailable(t *testing.T) {
	p, _ := NewGoogleProvider(ProviderConfig{APIKey: "key"})
	if !p.IsAvailable() {
		t.Error("expected IsAvailable to be true")
	}
}

func TestGoogleProvider_Name(t *testing.T) {
	p, _ := NewGoogleProvider(ProviderConfig{APIKey: "key"})
	if p.Name() != "google" {
		t.Errorf("expected name 'google', got %q", p.Name())
	}
}

func TestParseGoogleDuration(t *testing.T) {
	tests := []struct {
		input string
		want  float64
	}{
		{"0s", 0},
		{"1s", 1},
		{"0.5s", 0.5},
		{"1.5s", 1.5},
		{"2.0s", 2},
		{"", 0},
		{"invalid", 0},
	}

	for _, tt := range tests {
		got := parseGoogleDuration(tt.input)
		if got != tt.want {
			t.Errorf("parseGoogleDuration(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}
