package ai

import (
	"context"
	"fmt"

	"verbal/internal/settings"
)

// Factory creates AI providers from settings.
type Factory struct{}

// NewFactory creates a new AI provider factory.
func NewFactory() *Factory {
	return &Factory{}
}

// CreateProvider creates a Provider from the given configuration.
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

	default:
		return nil, fmt.Errorf("unknown provider config type: %T", config)
	}
}

// TestConnection validates the provider configuration by making a lightweight API call.
// Currently validates by attempting to create the provider - actual API validation
// would require making a test request which may consume quota.
func (f *Factory) TestConnection(ctx context.Context, config settings.ProviderConfig) error {
	// For now, just validate that we can create the provider
	// A full implementation would make a test API call
	_, err := f.CreateProvider(config)
	if err != nil {
		return fmt.Errorf("create provider: %w", err)
	}

	// TODO: Implement actual API test calls
	// This would require adding TestConnection methods to providers
	// that make lightweight API calls to validate credentials

	return nil
}

// CreateProviderFromSettings creates a provider from the full settings object.
// Uses the active provider configuration.
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

// Ensure Factory implements settings.ProviderFactory
var _ settings.ProviderFactory = (*Factory)(nil)
