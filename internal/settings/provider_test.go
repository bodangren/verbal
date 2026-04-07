package settings

import (
	"testing"
)

func TestProviderType_Valid(t *testing.T) {
	tests := []struct {
		name     string
		provider ProviderType
		want     bool
	}{
		{
			name:     "openai is valid",
			provider: ProviderOpenAI,
			want:     true,
		},
		{
			name:     "google is valid",
			provider: ProviderGoogle,
			want:     true,
		},
		{
			name:     "empty is invalid",
			provider: "",
			want:     false,
		},
		{
			name:     "unknown is invalid",
			provider: "unknown",
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.provider.Valid()
			if got != tt.want {
				t.Errorf("Valid() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestProviderType_String(t *testing.T) {
	if got := ProviderOpenAI.String(); got != "openai" {
		t.Errorf("ProviderOpenAI.String() = %v, want %v", got, "openai")
	}
	if got := ProviderGoogle.String(); got != "google" {
		t.Errorf("ProviderGoogle.String() = %v, want %v", got, "google")
	}
}

func TestOpenAIConfig_GetProviderType(t *testing.T) {
	config := &OpenAIConfig{}
	if got := config.GetProviderType(); got != ProviderOpenAI {
		t.Errorf("GetProviderType() = %v, want %v", got, ProviderOpenAI)
	}
}

func TestOpenAIConfig_Validate(t *testing.T) {
	tests := []struct {
		name    string
		config  *OpenAIConfig
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid with api key and model",
			config:  &OpenAIConfig{APIKey: "sk-test", Model: "whisper-1"},
			wantErr: false,
		},
		{
			name:    "valid with api key, defaults model",
			config:  &OpenAIConfig{APIKey: "sk-test"},
			wantErr: false,
		},
		{
			name:    "invalid without api key",
			config:  &OpenAIConfig{Model: "whisper-1"},
			wantErr: true,
			errMsg:  "api_key: API key is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if tt.wantErr {
				if err == nil {
					t.Errorf("Validate() expected error, got nil")
					return
				}
				if err.Error() != tt.errMsg {
					t.Errorf("Validate() error = %v, want %v", err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Validate() unexpected error = %v", err)
				}
				// Check default model was set
				if tt.config.Model == "" {
					t.Errorf("Validate() should set default model")
				}
			}
		})
	}
}

func TestOpenAIConfig_IsEmpty(t *testing.T) {
	tests := []struct {
		name   string
		config *OpenAIConfig
		want   bool
	}{
		{
			name:   "empty when no api key",
			config: &OpenAIConfig{},
			want:   true,
		},
		{
			name:   "empty with only model",
			config: &OpenAIConfig{Model: "whisper-1"},
			want:   true,
		},
		{
			name:   "not empty with api key",
			config: &OpenAIConfig{APIKey: "sk-test"},
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.config.IsEmpty(); got != tt.want {
				t.Errorf("IsEmpty() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGoogleConfig_GetProviderType(t *testing.T) {
	config := &GoogleConfig{}
	if got := config.GetProviderType(); got != ProviderGoogle {
		t.Errorf("GetProviderType() = %v, want %v", got, ProviderGoogle)
	}
}

func TestGoogleConfig_Validate(t *testing.T) {
	tests := []struct {
		name    string
		config  *GoogleConfig
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid with api key",
			config:  &GoogleConfig{APIKey: "google-api-key"},
			wantErr: false,
		},
		{
			name:    "invalid without api key",
			config:  &GoogleConfig{},
			wantErr: true,
			errMsg:  "api_key: API key is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if tt.wantErr {
				if err == nil {
					t.Errorf("Validate() expected error, got nil")
					return
				}
				if err.Error() != tt.errMsg {
					t.Errorf("Validate() error = %v, want %v", err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Validate() unexpected error = %v", err)
				}
			}
		})
	}
}

func TestGoogleConfig_IsEmpty(t *testing.T) {
	tests := []struct {
		name   string
		config *GoogleConfig
		want   bool
	}{
		{
			name:   "empty when no api key",
			config: &GoogleConfig{},
			want:   true,
		},
		{
			name:   "not empty with api key",
			config: &GoogleConfig{APIKey: "google-api-key"},
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.config.IsEmpty(); got != tt.want {
				t.Errorf("IsEmpty() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSettings_Validate(t *testing.T) {
	tests := []struct {
		name     string
		settings *Settings
		wantErr  bool
		errMsg   string
	}{
		{
			name: "valid with openai",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "sk-test", Model: "whisper-1"},
			},
			wantErr: false,
		},
		{
			name: "valid with google",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
				Google:         &GoogleConfig{APIKey: "google-key"},
			},
			wantErr: false,
		},
		{
			name: "invalid provider type",
			settings: &Settings{
				ActiveProvider: "invalid",
			},
			wantErr: true,
			errMsg:  "active_provider: invalid provider type",
		},
		{
			name: "openai missing config",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
			},
			wantErr: true,
			errMsg:  "openai: OpenAI configuration is required",
		},
		{
			name: "openai empty config",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{},
			},
			wantErr: true,
			errMsg:  "openai: OpenAI configuration is required",
		},
		{
			name: "google missing config",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
			},
			wantErr: true,
			errMsg:  "google: Google configuration is required",
		},
		{
			name: "google empty config",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
				Google:         &GoogleConfig{},
			},
			wantErr: true,
			errMsg:  "google: Google configuration is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.settings.Validate()
			if tt.wantErr {
				if err == nil {
					t.Errorf("Validate() expected error, got nil")
					return
				}
				if err.Error() != tt.errMsg {
					t.Errorf("Validate() error = %v, want %v", err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Validate() unexpected error = %v", err)
				}
			}
		})
	}
}

func TestSettings_GetActiveProviderConfig(t *testing.T) {
	tests := []struct {
		name     string
		settings *Settings
		wantType ProviderType
		wantNil  bool
	}{
		{
			name: "openai config",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "sk-test"},
			},
			wantType: ProviderOpenAI,
			wantNil:  false,
		},
		{
			name: "google config",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
				Google:         &GoogleConfig{APIKey: "google-key"},
			},
			wantType: ProviderGoogle,
			wantNil:  false,
		},
		{
			name:     "unknown provider returns nil",
			settings: &Settings{ActiveProvider: "unknown"},
			wantNil:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.settings.GetActiveProviderConfig()
			if tt.wantNil {
				if got != nil {
					t.Errorf("GetActiveProviderConfig() = %v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Errorf("GetActiveProviderConfig() = nil, want non-nil")
				return
			}
			if got.GetProviderType() != tt.wantType {
				t.Errorf("GetProviderType() = %v, want %v", got.GetProviderType(), tt.wantType)
			}
		})
	}
}

func TestSettings_Clone(t *testing.T) {
	original := &Settings{
		ActiveProvider: ProviderOpenAI,
		OpenAI: &OpenAIConfig{
			APIKey: "sk-test",
			Model:  "whisper-1",
		},
		Google: &GoogleConfig{
			APIKey: "google-key",
		},
	}

	clone := original.Clone()

	// Verify clone has same values
	if clone.ActiveProvider != original.ActiveProvider {
		t.Errorf("Clone ActiveProvider = %v, want %v", clone.ActiveProvider, original.ActiveProvider)
	}
	if clone.OpenAI.APIKey != original.OpenAI.APIKey {
		t.Errorf("Clone OpenAI.APIKey = %v, want %v", clone.OpenAI.APIKey, original.OpenAI.APIKey)
	}
	if clone.OpenAI.Model != original.OpenAI.Model {
		t.Errorf("Clone OpenAI.Model = %v, want %v", clone.OpenAI.Model, original.OpenAI.Model)
	}
	if clone.Google.APIKey != original.Google.APIKey {
		t.Errorf("Clone Google.APIKey = %v, want %v", clone.Google.APIKey, original.Google.APIKey)
	}

	// Verify clone is independent (modifying clone doesn't affect original)
	clone.ActiveProvider = ProviderGoogle
	clone.OpenAI.APIKey = "modified"
	clone.OpenAI.Model = "modified"
	clone.Google.APIKey = "modified"

	if original.ActiveProvider != ProviderOpenAI {
		t.Errorf("Original was modified after clone modification")
	}
	if original.OpenAI.APIKey != "sk-test" {
		t.Errorf("Original OpenAI.APIKey was modified")
	}
	if original.OpenAI.Model != "whisper-1" {
		t.Errorf("Original OpenAI.Model was modified")
	}
	if original.Google.APIKey != "google-key" {
		t.Errorf("Original Google.APIKey was modified")
	}
}

func TestSettings_Clone_Nil(t *testing.T) {
	var s *Settings
	clone := s.Clone()
	if clone != nil {
		t.Errorf("Clone() of nil should return nil, got %v", clone)
	}
}

func TestValidationError_Error(t *testing.T) {
	err := &ValidationError{Field: "api_key", Message: "API key is required"}
	want := "api_key: API key is required"
	if got := err.Error(); got != want {
		t.Errorf("Error() = %v, want %v", got, want)
	}
}
