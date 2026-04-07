package settings

import (
	"testing"
)

// TestIntegration_SettingsEndToEnd tests the complete settings workflow
// from creation through validation to provider switching
func TestIntegration_SettingsEndToEnd(t *testing.T) {
	// Test 1: Create default settings
	settings := CreateDefaultSettings()
	if settings == nil {
		t.Fatal("CreateDefaultSettings returned nil")
	}
	if !settings.ActiveProvider.Valid() {
		t.Error("Default settings should have valid provider")
	}

	// Test 2: Configure OpenAI
	settings.ActiveProvider = ProviderOpenAI
	settings.OpenAI = &OpenAIConfig{
		APIKey: "sk-test123",
		Model:  "whisper-1",
	}

	// Validate OpenAI config
	if err := settings.Validate(); err != nil {
		t.Errorf("Valid OpenAI settings should not error: %v", err)
	}

	// Test 3: Switch to Google provider
	settings.ActiveProvider = ProviderGoogle
	settings.Google = &GoogleConfig{
		APIKey: "google-test-key",
	}

	// Validate Google config
	if err := settings.Validate(); err != nil {
		t.Errorf("Valid Google settings should not error: %v", err)
	}

	// Test 4: Clone settings
	cloned := settings.Clone()
	if cloned == nil {
		t.Fatal("Clone returned nil")
	}
	if cloned.ActiveProvider != settings.ActiveProvider {
		t.Error("Cloned settings should have same provider")
	}
	if cloned.Google.APIKey != settings.Google.APIKey {
		t.Error("Cloned settings should have same Google API key")
	}

	// Test 5: Modify original shouldn't affect clone
	settings.Google.APIKey = "modified-key"
	if cloned.Google.APIKey == "modified-key" {
		t.Error("Clone should be independent of original")
	}
}

// TestIntegration_ProviderSwitching tests switching between providers
func TestIntegration_ProviderSwitching(t *testing.T) {
	testCases := []struct {
		name            string
		initialProvider ProviderType
		targetProvider  ProviderType
		setupFunc       func() *Settings
		wantValid       bool
	}{
		{
			name:            "OpenAI to Google",
			initialProvider: ProviderOpenAI,
			targetProvider:  ProviderGoogle,
			setupFunc: func() *Settings {
				return &Settings{
					ActiveProvider: ProviderOpenAI,
					OpenAI: &OpenAIConfig{
						APIKey: "sk-test",
						Model:  "whisper-1",
					},
					Google: &GoogleConfig{
						APIKey: "google-test",
					},
				}
			},
			wantValid: true,
		},
		{
			name:            "Google to OpenAI",
			initialProvider: ProviderGoogle,
			targetProvider:  ProviderOpenAI,
			setupFunc: func() *Settings {
				return &Settings{
					ActiveProvider: ProviderGoogle,
					OpenAI: &OpenAIConfig{
						APIKey: "sk-test",
						Model:  "whisper-1",
					},
					Google: &GoogleConfig{
						APIKey: "google-test",
					},
				}
			},
			wantValid: true,
		},
		{
			name:            "Switch to provider with empty config",
			initialProvider: ProviderOpenAI,
			targetProvider:  ProviderGoogle,
			setupFunc: func() *Settings {
				return &Settings{
					ActiveProvider: ProviderOpenAI,
					OpenAI: &OpenAIConfig{
						APIKey: "sk-test",
					},
					Google: &GoogleConfig{
						APIKey: "", // Empty - should fail validation
					},
				}
			},
			wantValid: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			s := tc.setupFunc()

			// Verify initial state
			if s.ActiveProvider != tc.initialProvider {
				t.Errorf("Initial provider = %v, want %v", s.ActiveProvider, tc.initialProvider)
			}

			// Switch provider
			s.ActiveProvider = tc.targetProvider

			// Validate after switch
			err := s.Validate()
			isValid := err == nil
			if isValid != tc.wantValid {
				t.Errorf("Validation after switch: valid = %v, want %v (error: %v)", isValid, tc.wantValid, err)
			}

			// Get active config should return correct type
			config := s.GetActiveProviderConfig()
			if config == nil && tc.wantValid {
				t.Error("GetActiveProviderConfig returned nil for valid settings")
			}
			if config != nil && config.GetProviderType() != tc.targetProvider {
				t.Errorf("Active config provider = %v, want %v", config.GetProviderType(), tc.targetProvider)
			}
		})
	}
}

// TestIntegration_ConfigValidation tests comprehensive config validation scenarios
func TestIntegration_ConfigValidation(t *testing.T) {
	testCases := []struct {
		name      string
		settings  *Settings
		wantError bool
	}{
		{
			name: "Valid OpenAI with all fields",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI: &OpenAIConfig{
					APIKey: "sk-test123",
					Model:  "whisper-1",
				},
			},
			wantError: false,
		},
		{
			name: "Valid OpenAI with default model",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI: &OpenAIConfig{
					APIKey: "sk-test123",
					Model:  "", // Should use default
				},
			},
			wantError: false,
		},
		{
			name: "Invalid OpenAI - empty API key",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI: &OpenAIConfig{
					APIKey: "",
					Model:  "whisper-1",
				},
			},
			wantError: true,
		},
		{
			name: "Valid Google",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
				Google: &GoogleConfig{
					APIKey: "google-test-key",
				},
			},
			wantError: false,
		},
		{
			name: "Invalid Google - empty API key",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
				Google: &GoogleConfig{
					APIKey: "",
				},
			},
			wantError: true,
		},
		{
			name: "Invalid - unknown provider",
			settings: &Settings{
				ActiveProvider: ProviderType("unknown"),
			},
			wantError: true,
		},
		{
			name: "Invalid - OpenAI active but config is empty",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{},
			},
			wantError: true,
		},
		{
			name: "Invalid - Google active but config is nil",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
				Google:         nil,
			},
			wantError: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.settings.Validate()
			hasError := err != nil
			if hasError != tc.wantError {
				t.Errorf("Validate() error = %v, wantError = %v", err, tc.wantError)
			}
		})
	}
}

// TestIntegration_ConfigIndependence tests that provider configs are independent
func TestIntegration_ConfigIndependence(t *testing.T) {
	settings := &Settings{
		ActiveProvider: ProviderOpenAI,
		OpenAI: &OpenAIConfig{
			APIKey: "openai-key",
			Model:  "whisper-1",
		},
		Google: &GoogleConfig{
			APIKey: "google-key",
		},
	}

	// Switch between providers multiple times
	for i := 0; i < 3; i++ {
		settings.ActiveProvider = ProviderGoogle
		config := settings.GetActiveProviderConfig()
		if config.GetProviderType() != ProviderGoogle {
			t.Error("Should get Google config")
		}

		settings.ActiveProvider = ProviderOpenAI
		config = settings.GetActiveProviderConfig()
		if config.GetProviderType() != ProviderOpenAI {
			t.Error("Should get OpenAI config")
		}
	}

	// Verify both configs are still intact
	if settings.OpenAI.APIKey != "openai-key" {
		t.Error("OpenAI config was modified")
	}
	if settings.Google.APIKey != "google-key" {
		t.Error("Google config was modified")
	}
}
