// Package settings provides configuration management for AI transcription providers.
package settings

import (
	"context"
	"fmt"
	"os"
	"time"
)

// Repository defines the interface for settings persistence.
type Repository interface {
	GetSettings() (*Settings, error)
	SaveSettings(*Settings) error
	HasSettings() (bool, error)
}

// ProviderFactory defines the interface for creating AI providers.
type ProviderFactory interface {
	// TestConnection validates the provider configuration by making a test API call.
	TestConnection(ctx context.Context, config ProviderConfig) error
}

// Service provides business logic for managing application settings.
type Service struct {
	repo    Repository
	factory ProviderFactory
}

// NewService creates a new settings service.
func NewService(repo Repository, factory ProviderFactory) *Service {
	return &Service{
		repo:    repo,
		factory: factory,
	}
}

// GetSettings retrieves the current application settings.
// Returns default settings if none exist.
func (s *Service) GetSettings() (*Settings, error) {
	settings, err := s.repo.GetSettings()
	if err != nil {
		return nil, fmt.Errorf("get settings: %w", err)
	}

	return settings, nil
}

// SaveSettings validates and saves the application settings.
func (s *Service) SaveSettings(settings *Settings) error {
	// Validate settings
	if err := settings.Validate(); err != nil {
		return fmt.Errorf("invalid settings: %w", err)
	}

	// Save to repository
	if err := s.repo.SaveSettings(settings); err != nil {
		return fmt.Errorf("save settings: %w", err)
	}

	return nil
}

// GetActiveProvider returns the configuration for the currently active provider.
func (s *Service) GetActiveProvider() (ProviderConfig, error) {
	settings, err := s.GetSettings()
	if err != nil {
		return nil, err
	}

	config := settings.GetActiveProviderConfig()
	if config == nil {
		return nil, fmt.Errorf("no configuration for active provider: %s", settings.ActiveProvider)
	}

	return config, nil
}

// TestProviderConnection validates the provider configuration by making a test API call.
// Uses a timeout context to prevent hanging.
func (s *Service) TestProviderConnection(config ProviderConfig) error {
	if s.factory == nil {
		return fmt.Errorf("provider factory not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return s.factory.TestConnection(ctx, config)
}

// HasSettings returns true if settings have been saved.
func (s *Service) HasSettings() (bool, error) {
	return s.repo.HasSettings()
}

// LoadSettingsOrDefault loads settings from the repository, or returns defaults if none exist.
// This is useful for initialization when you want to ensure a Settings object is always available.
func (s *Service) LoadSettingsOrDefault() (*Settings, error) {
	settings, err := s.GetSettings()
	if err != nil {
		return nil, err
	}

	// Ensure non-nil configs
	if settings.OpenAI == nil {
		settings.OpenAI = &OpenAIConfig{}
	}
	if settings.Google == nil {
		settings.Google = &GoogleConfig{}
	}

	return settings, nil
}

// CreateDefaultSettings creates a Settings struct with sensible defaults.
func CreateDefaultSettings() *Settings {
	return &Settings{
		ActiveProvider: ProviderOpenAI,
		OpenAI: &OpenAIConfig{
			APIKey: "",
			Model:  "whisper-1",
		},
		Google: &GoogleConfig{
			APIKey: "",
		},
	}
}

// GetAPIKeyFromEnv retrieves an API key from environment variables.
// Returns empty string if not found.
func GetAPIKeyFromEnv(provider ProviderType) string {
	switch provider {
	case ProviderOpenAI:
		return os.Getenv("OPENAI_API_KEY")
	case ProviderGoogle:
		return os.Getenv("GOOGLE_API_KEY")
	}
	return ""
}

// ImportFromEnv imports provider configuration from environment variables.
// This is useful for initial setup or migration from env-based config.
func (s *Service) ImportFromEnv() (*Settings, error) {
	settings := CreateDefaultSettings()

	// Try OpenAI first
	openaiKey := GetAPIKeyFromEnv(ProviderOpenAI)
	if openaiKey != "" {
		settings.ActiveProvider = ProviderOpenAI
		settings.OpenAI.APIKey = openaiKey
		// Model could be set via env var in future
	}

	// Also check Google
	googleKey := GetAPIKeyFromEnv(ProviderGoogle)
	if googleKey != "" {
		settings.Google.APIKey = googleKey
		// If no OpenAI key, use Google as default
		if openaiKey == "" {
			settings.ActiveProvider = ProviderGoogle
		}
	}

	// Save if we found any keys
	if openaiKey != "" || googleKey != "" {
		if err := s.SaveSettings(settings); err != nil {
			return nil, fmt.Errorf("save imported settings: %w", err)
		}
	}

	return settings, nil
}

// SettingsChanged returns true if the settings have meaningfully changed.
// Compares active provider and API keys (not models or other metadata).
func SettingsChanged(old, new *Settings) bool {
	if old == nil || new == nil {
		return true
	}

	if old.ActiveProvider != new.ActiveProvider {
		return true
	}

	// Compare OpenAI config
	oldOpenAI := ""
	if old.OpenAI != nil {
		oldOpenAI = old.OpenAI.APIKey
	}
	newOpenAI := ""
	if new.OpenAI != nil {
		newOpenAI = new.OpenAI.APIKey
	}
	if oldOpenAI != newOpenAI {
		return true
	}

	// Compare Google config
	oldGoogle := ""
	if old.Google != nil {
		oldGoogle = old.Google.APIKey
	}
	newGoogle := ""
	if new.Google != nil {
		newGoogle = new.Google.APIKey
	}
	if oldGoogle != newGoogle {
		return true
	}

	return false
}
