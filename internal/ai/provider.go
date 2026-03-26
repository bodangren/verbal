package ai

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"
)

var (
	ErrNoProvider        = errors.New("no AI provider configured")
	ErrAuthFailed        = errors.New("authentication failed")
	ErrRateLimited       = errors.New("rate limited")
	ErrInvalidResponse   = errors.New("invalid response from provider")
	ErrFileTooLarge      = errors.New("file too large for transcription")
	ErrUnsupportedFormat = errors.New("unsupported audio format")
)

type RateLimitError struct {
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("rate limited, retry after %v", e.RetryAfter)
}

func (e *RateLimitError) Unwrap() error {
	return ErrRateLimited
}

type AuthError struct {
	Provider string
	Message  string
}

func (e *AuthError) Error() string {
	return fmt.Sprintf("%s auth failed: %s", e.Provider, e.Message)
}

func (e *AuthError) Unwrap() error {
	return ErrAuthFailed
}

type WordTimestamp struct {
	Word       string  `json:"word"`
	Start      float64 `json:"start"`
	End        float64 `json:"end"`
	Confidence float64 `json:"confidence,omitempty"`
}

type TranscriptionResult struct {
	Text     string          `json:"text"`
	Words    []WordTimestamp `json:"words"`
	Duration float64         `json:"duration"`
	Language string          `json:"language,omitempty"`
	Provider string          `json:"provider"`
}

func (r *TranscriptionResult) GetWordAtTime(t float64) *WordTimestamp {
	for _, w := range r.Words {
		if t >= w.Start && t <= w.End {
			return &w
		}
	}
	return nil
}

func (r *TranscriptionResult) GetSegment(start, end float64) []WordTimestamp {
	var segment []WordTimestamp
	for _, w := range r.Words {
		if w.Start >= start && w.End <= end {
			segment = append(segment, w)
		}
	}
	return segment
}

type TranscriptionOptions struct {
	Language         string
	EnableTimestamps bool
}

type TranscriptionProvider interface {
	Name() string
	Transcribe(ctx context.Context, audioData []byte, opts TranscriptionOptions) (*TranscriptionResult, error)
	TranscribeFile(ctx context.Context, filePath string, opts TranscriptionOptions) (*TranscriptionResult, error)
	IsAvailable() bool
}

type ProviderConfig struct {
	Name     string
	APIKey   string
	Endpoint string
	Model    string
	Timeout  time.Duration
}

func (c *ProviderConfig) Validate() error {
	if c.APIKey == "" {
		return &AuthError{
			Provider: c.Name,
			Message:  "API key is required",
		}
	}
	return nil
}

type ProviderType string

const (
	ProviderOpenAI ProviderType = "openai"
	ProviderGoogle ProviderType = "google"
)

func NewProvider(providerType ProviderType, config ProviderConfig) (TranscriptionProvider, error) {
	config.Name = string(providerType)

	switch providerType {
	case ProviderOpenAI:
		return NewOpenAIProvider(config)
	case ProviderGoogle:
		return NewGoogleProvider(config)
	default:
		return nil, fmt.Errorf("unknown provider type: %s", providerType)
	}
}

type Config struct {
	Provider ProviderType
	OpenAI   ProviderConfig
	Google   ProviderConfig
}

func NewProviderFromEnv() (TranscriptionProvider, error) {
	providerType := ProviderType(os.Getenv("AI_PROVIDER"))
	if providerType == "" {
		providerType = ProviderOpenAI
	}

	var config ProviderConfig
	switch providerType {
	case ProviderOpenAI:
		config = ProviderConfig{
			Name:     "openai",
			APIKey:   os.Getenv("OPENAI_API_KEY"),
			Endpoint: os.Getenv("OPENAI_ENDPOINT"),
			Model:    os.Getenv("OPENAI_MODEL"),
		}
	case ProviderGoogle:
		config = ProviderConfig{
			Name:     "google",
			APIKey:   os.Getenv("GOOGLE_API_KEY"),
			Endpoint: os.Getenv("GOOGLE_SPEECH_ENDPOINT"),
		}
	default:
		return nil, fmt.Errorf("unknown provider type: %s", providerType)
	}

	return NewProvider(providerType, config)
}
