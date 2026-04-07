// Package settings provides configuration management for AI transcription providers.
package settings

// ProviderType represents the available AI transcription providers.
type ProviderType string

const (
	// ProviderOpenAI represents the OpenAI Whisper API.
	ProviderOpenAI ProviderType = "openai"
	// ProviderGoogle represents the Google Speech-to-Text API.
	ProviderGoogle ProviderType = "google"
)

// Valid returns true if the provider type is valid.
func (p ProviderType) Valid() bool {
	switch p {
	case ProviderOpenAI, ProviderGoogle:
		return true
	}
	return false
}

// String returns the string representation of the provider type.
func (p ProviderType) String() string {
	return string(p)
}

// ProviderConfig defines the interface for provider-specific configurations.
type ProviderConfig interface {
	// GetProviderType returns the type of this provider configuration.
	GetProviderType() ProviderType
	// Validate checks if the configuration is valid for use.
	Validate() error
	// IsEmpty returns true if the configuration has no values set.
	IsEmpty() bool
}

// OpenAIConfig holds configuration for the OpenAI Whisper API.
type OpenAIConfig struct {
	// APIKey is the OpenAI API key.
	APIKey string `json:"api_key"`
	// Model is the Whisper model to use (e.g., "whisper-1").
	Model string `json:"model"`
}

// GetProviderType returns ProviderOpenAI.
func (o *OpenAIConfig) GetProviderType() ProviderType {
	return ProviderOpenAI
}

// Validate checks if the OpenAI configuration is valid.
func (o *OpenAIConfig) Validate() error {
	if o.APIKey == "" {
		return &ValidationError{Field: "api_key", Message: "API key is required"}
	}
	if o.Model == "" {
		o.Model = "whisper-1"
	}
	return nil
}

// IsEmpty returns true if no API key is set.
func (o *OpenAIConfig) IsEmpty() bool {
	return o.APIKey == ""
}

// GoogleConfig holds configuration for the Google Speech-to-Text API.
type GoogleConfig struct {
	// APIKey is the Google Cloud API key.
	APIKey string `json:"api_key"`
}

// GetProviderType returns ProviderGoogle.
func (g *GoogleConfig) GetProviderType() ProviderType {
	return ProviderGoogle
}

// Validate checks if the Google configuration is valid.
func (g *GoogleConfig) Validate() error {
	if g.APIKey == "" {
		return &ValidationError{Field: "api_key", Message: "API key is required"}
	}
	return nil
}

// IsEmpty returns true if no API key is set.
func (g *GoogleConfig) IsEmpty() bool {
	return g.APIKey == ""
}

// Settings holds the application settings including provider configurations.
type Settings struct {
	// ActiveProvider is the currently selected provider type.
	ActiveProvider ProviderType `json:"active_provider"`
	// OpenAI configuration.
	OpenAI *OpenAIConfig `json:"openai,omitempty"`
	// Google configuration.
	Google *GoogleConfig `json:"google,omitempty"`
}

// ValidationError represents a validation error for a specific field.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Error implements the error interface.
func (v *ValidationError) Error() string {
	return v.Field + ": " + v.Message
}

// Validate checks if the settings are valid.
func (s *Settings) Validate() error {
	if !s.ActiveProvider.Valid() {
		return &ValidationError{Field: "active_provider", Message: "invalid provider type"}
	}

	switch s.ActiveProvider {
	case ProviderOpenAI:
		if s.OpenAI == nil || s.OpenAI.IsEmpty() {
			return &ValidationError{Field: "openai", Message: "OpenAI configuration is required"}
		}
		if err := s.OpenAI.Validate(); err != nil {
			return err
		}
	case ProviderGoogle:
		if s.Google == nil || s.Google.IsEmpty() {
			return &ValidationError{Field: "google", Message: "Google configuration is required"}
		}
		if err := s.Google.Validate(); err != nil {
			return err
		}
	}

	return nil
}

// GetActiveProviderConfig returns the configuration for the active provider.
// Returns nil if the active provider has no configuration.
func (s *Settings) GetActiveProviderConfig() ProviderConfig {
	switch s.ActiveProvider {
	case ProviderOpenAI:
		if s.OpenAI == nil || s.OpenAI.IsEmpty() {
			return nil
		}
		return s.OpenAI
	case ProviderGoogle:
		if s.Google == nil || s.Google.IsEmpty() {
			return nil
		}
		return s.Google
	}
	return nil
}

// Clone creates a deep copy of the settings.
func (s *Settings) Clone() *Settings {
	if s == nil {
		return nil
	}

	clone := &Settings{
		ActiveProvider: s.ActiveProvider,
	}

	if s.OpenAI != nil {
		clone.OpenAI = &OpenAIConfig{
			APIKey: s.OpenAI.APIKey,
			Model:  s.OpenAI.Model,
		}
	}

	if s.Google != nil {
		clone.Google = &GoogleConfig{
			APIKey: s.Google.APIKey,
		}
	}

	return clone
}
