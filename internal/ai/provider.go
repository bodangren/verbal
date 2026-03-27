package ai

import (
	"context"
	"fmt"
	"os"
)

// Provider defines the interface for AI services (OpenAI, Google, etc.)
type Provider interface {
	Name() string
	Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error)
	// Future: GenerateBRoll, CloneVoice, etc.
}

type TranscriptionResult struct {
	Text     string         `json:"text"`
	Words    []Word         `json:"words"`
	Language string         `json:"language"`
	Duration float64        `json:"duration"`
}

type Word struct {
	Text  string  `json:"text"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

// Config holds the credentials for AI providers
type Config struct {
	OpenAIKey string
	GoogleKey string
}

func NewProviderFromEnv() (Provider, error) {
	if key := os.Getenv("OPENAI_API_KEY"); key != "" {
		return NewOpenAIProvider(key), nil
	}
	if key := os.Getenv("GOOGLE_API_KEY"); key != "" {
		return NewGoogleProvider(key), nil
	}
	return nil, fmt.Errorf("no AI provider credentials found in environment (set OPENAI_API_KEY or GOOGLE_API_KEY)")
}

// OpenAI Implementation
type OpenAIProvider struct {
	apiKey string
}

func NewOpenAIProvider(apiKey string) *OpenAIProvider {
	return &OpenAIProvider{apiKey: apiKey}
}

func (p *OpenAIProvider) Name() string { return "OpenAI" }

func (p *OpenAIProvider) Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	// Implementation will use Whisper API
	return nil, fmt.Errorf("OpenAI transcription not yet implemented in Go")
}

// Google Implementation
type GoogleProvider struct {
	apiKey string
}

func NewGoogleProvider(apiKey string) *GoogleProvider {
	return &GoogleProvider{apiKey: apiKey}
}

func (p *GoogleProvider) Name() string { return "Google" }

func (p *GoogleProvider) Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	// Implementation will use Vertex AI / Gemini
	return nil, fmt.Errorf("Google transcription not yet implemented in Go")
}
