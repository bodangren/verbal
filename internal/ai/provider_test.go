package ai

import (
	"errors"
	"os"
	"testing"
	"time"
)

func TestNewProvider(t *testing.T) {
	tests := []struct {
		name         string
		providerType ProviderType
		config       ProviderConfig
		wantErr      bool
	}{
		{
			name:         "openai provider",
			providerType: ProviderOpenAI,
			config:       ProviderConfig{APIKey: "test-key"},
			wantErr:      false,
		},
		{
			name:         "google provider",
			providerType: ProviderGoogle,
			config:       ProviderConfig{APIKey: "test-key"},
			wantErr:      false,
		},
		{
			name:         "unknown provider",
			providerType: ProviderType("unknown"),
			config:       ProviderConfig{APIKey: "test-key"},
			wantErr:      true,
		},
		{
			name:         "missing API key",
			providerType: ProviderOpenAI,
			config:       ProviderConfig{},
			wantErr:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p, err := NewProvider(tt.providerType, tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewProvider() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && p == nil {
				t.Error("expected provider, got nil")
			}
		})
	}
}

func TestNewProviderFromEnv(t *testing.T) {
	tests := []struct {
		name     string
		envVars  map[string]string
		wantErr  bool
		wantName string
	}{
		{
			name:     "default to openai",
			envVars:  map[string]string{"OPENAI_API_KEY": "test-key"},
			wantErr:  false,
			wantName: "openai",
		},
		{
			name: "explicit google provider",
			envVars: map[string]string{
				"AI_PROVIDER":    "google",
				"GOOGLE_API_KEY": "test-key",
			},
			wantErr:  false,
			wantName: "google",
		},
		{
			name:    "missing API key",
			envVars: map[string]string{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			os.Clearenv()
			for k, v := range tt.envVars {
				os.Setenv(k, v)
			}

			p, err := NewProviderFromEnv()
			if (err != nil) != tt.wantErr {
				t.Errorf("NewProviderFromEnv() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if p == nil {
					t.Error("expected provider, got nil")
				}
				if p.Name() != tt.wantName {
					t.Errorf("expected provider name %q, got %q", tt.wantName, p.Name())
				}
			}
		})
	}
}

func TestRateLimitError(t *testing.T) {
	err := &RateLimitError{RetryAfter: 30 * time.Second}
	if !errors.Is(err, ErrRateLimited) {
		t.Error("RateLimitError should wrap ErrRateLimited")
	}
	if err.Error() == "" {
		t.Error("RateLimitError should have message")
	}
}

func TestAuthError(t *testing.T) {
	err := &AuthError{Provider: "openai", Message: "invalid key"}
	if !errors.Is(err, ErrAuthFailed) {
		t.Error("AuthError should wrap ErrAuthFailed")
	}
	if err.Error() == "" {
		t.Error("AuthError should have message")
	}
}

func TestTranscriptionResult_GetWordAtTime(t *testing.T) {
	result := &TranscriptionResult{
		Text: "hello world",
		Words: []WordTimestamp{
			{Word: "hello", Start: 0.0, End: 0.5},
			{Word: "world", Start: 0.6, End: 1.0},
		},
	}

	tests := []struct {
		time     float64
		wantWord string
	}{
		{0.2, "hello"},
		{0.8, "world"},
		{1.5, ""},
	}

	for _, tt := range tests {
		word := result.GetWordAtTime(tt.time)
		if tt.wantWord == "" {
			if word != nil {
				t.Errorf("GetWordAtTime(%v) = %v, want nil", tt.time, word)
			}
		} else if word == nil || word.Word != tt.wantWord {
			t.Errorf("GetWordAtTime(%v) = %v, want word %q", tt.time, word, tt.wantWord)
		}
	}
}

func TestTranscriptionResult_GetSegment(t *testing.T) {
	result := &TranscriptionResult{
		Text: "one two three four",
		Words: []WordTimestamp{
			{Word: "one", Start: 0.0, End: 0.5},
			{Word: "two", Start: 0.6, End: 1.0},
			{Word: "three", Start: 1.1, End: 1.5},
			{Word: "four", Start: 1.6, End: 2.0},
		},
	}

	segment := result.GetSegment(0.5, 1.5)
	if len(segment) != 2 {
		t.Errorf("GetSegment returned %d words, want 2", len(segment))
	}
}

func TestProviderConfig_Validate(t *testing.T) {
	tests := []struct {
		name    string
		config  ProviderConfig
		wantErr bool
	}{
		{
			name:    "empty API key",
			config:  ProviderConfig{Name: "test"},
			wantErr: true,
		},
		{
			name:    "valid config",
			config:  ProviderConfig{Name: "test", APIKey: "key123"},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
