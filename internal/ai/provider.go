package ai

import (
	"context"
	"fmt"
	"os"
	"time"
)

const defaultProviderHTTPTimeout = 5 * time.Minute

// Provider defines the interface for AI services (OpenAI, Google, etc.)
type Provider interface {
	Name() string
	Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error)
	// Future: GenerateBRoll, CloneVoice, etc.
}

type TranscriptionResult struct {
	Text     string  `json:"text"`
	Words    []Word  `json:"words"`
	Language string  `json:"language"`
	Duration float64 `json:"duration"`
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
