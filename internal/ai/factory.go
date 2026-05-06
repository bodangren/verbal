package ai

import (
	"context"
	"fmt"

	"verbal/internal/ai/local"
	"verbal/internal/settings"
)

type Factory struct{}

func NewFactory() *Factory {
	return &Factory{}
}

func (f *Factory) CreateProvider(config settings.ProviderConfig) (Provider, error) {
	if config == nil {
		return nil, fmt.Errorf("provider config is nil")
	}

	switch cfg := config.(type) {
	case *settings.OpenAIConfig:
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("OpenAI API key is required")
		}
		return NewOpenAIProvider(cfg.APIKey), nil

	case *settings.GoogleConfig:
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("Google API key is required")
		}
		return NewGoogleProvider(cfg.APIKey), nil

	case *settings.LocalConfig:
		if cfg.ModelPath == "" {
			return nil, fmt.Errorf("local model path is required")
		}
		return newLocalProviderAdapter(cfg.ModelPath, cfg.ModelSize), nil

	default:
		return nil, fmt.Errorf("unknown provider config type: %T", config)
	}
}

func (f *Factory) TestConnection(ctx context.Context, config settings.ProviderConfig) error {
	_, err := f.CreateProvider(config)
	if err != nil {
		return fmt.Errorf("create provider: %w", err)
	}
	return nil
}

func (f *Factory) CreateProviderFromSettings(s *settings.Settings) (Provider, error) {
	if s == nil {
		return nil, fmt.Errorf("settings is nil")
	}

	config := s.GetActiveProviderConfig()
	if config == nil {
		return nil, fmt.Errorf("no active provider configuration")
	}

	return f.CreateProvider(config)
}

var _ settings.ProviderFactory = (*Factory)(nil)

type localProviderAdapter struct {
	local *local.LocalProvider
}

func newLocalProviderAdapter(modelPath, modelSize string) Provider {
	return &localProviderAdapter{
		local: local.NewLocalProviderWithSize(modelPath, local.ModelSize(modelSize)),
	}
}

func (a *localProviderAdapter) Name() string {
	return a.local.Name()
}

func (a *localProviderAdapter) Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	result, err := a.local.Transcribe(ctx, audioPath)
	if err != nil {
		return nil, err
	}
	return &TranscriptionResult{
		Text:     result.Text,
		Words:    convertLocalWords(result.Words),
		Language: result.Language,
		Duration: result.Duration,
	}, nil
}

func convertLocalWords(words []local.Word) []Word {
	result := make([]Word, len(words))
	for i, w := range words {
		result[i] = Word{Text: w.Text, Start: w.Start, End: w.End}
	}
	return result
}