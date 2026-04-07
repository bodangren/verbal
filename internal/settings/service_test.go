package settings

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
)

// MockRepository is a mock implementation of the Repository interface.
type MockRepository struct {
	settings      *Settings
	hasSettings   bool
	getError      error
	saveError     error
	saveCalled    bool
	savedSettings *Settings
}

func (m *MockRepository) GetSettings() (*Settings, error) {
	if m.getError != nil {
		return nil, m.getError
	}
	if m.settings != nil {
		return m.settings.Clone(), nil
	}
	return CreateDefaultSettings(), nil
}

func (m *MockRepository) SaveSettings(s *Settings) error {
	m.saveCalled = true
	if m.saveError != nil {
		return m.saveError
	}
	m.savedSettings = s.Clone()
	m.settings = s.Clone()
	return nil
}

func (m *MockRepository) HasSettings() (bool, error) {
	return m.hasSettings, nil
}

// MockProviderFactory is a mock implementation of the ProviderFactory interface.
type MockProviderFactory struct {
	testConnectionFunc func(ctx context.Context, config ProviderConfig) error
}

func (m *MockProviderFactory) TestConnection(ctx context.Context, config ProviderConfig) error {
	if m.testConnectionFunc != nil {
		return m.testConnectionFunc(ctx, config)
	}
	return nil
}

func TestNewService(t *testing.T) {
	repo := &MockRepository{}
	factory := &MockProviderFactory{}

	service := NewService(repo, factory)
	if service == nil {
		t.Error("NewService() returned nil")
	}
	if service.repo != repo {
		t.Error("NewService() did not set repo correctly")
	}
	if service.factory != factory {
		t.Error("NewService() did not set factory correctly")
	}
}

func TestService_GetSettings(t *testing.T) {
	tests := []struct {
		name         string
		settings     *Settings
		getError     error
		wantErr      bool
		wantProvider ProviderType
	}{
		{
			name: "returns settings from repo",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
				OpenAI:         &OpenAIConfig{APIKey: "test"},
				Google:         &GoogleConfig{APIKey: "test"},
			},
			wantProvider: ProviderGoogle,
		},
		{
			name:     "returns error on repo failure",
			getError: errors.New("database error"),
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &MockRepository{
				settings: tt.settings,
				getError: tt.getError,
			}
			service := NewService(repo, nil)

			got, err := service.GetSettings()
			if tt.wantErr {
				if err == nil {
					t.Error("GetSettings() expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("GetSettings() error = %v", err)
				return
			}
			if got.ActiveProvider != tt.wantProvider {
				t.Errorf("ActiveProvider = %v, want %v", got.ActiveProvider, tt.wantProvider)
			}
		})
	}
}

func TestService_SaveSettings(t *testing.T) {
	tests := []struct {
		name         string
		settings     *Settings
		validateErr  bool
		saveError    error
		wantErr      bool
		wantSaveCall bool
	}{
		{
			name: "valid settings saved",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "test", Model: "whisper-1"},
			},
			wantSaveCall: true,
		},
		{
			name: "validation error",
			settings: &Settings{
				ActiveProvider: "invalid",
			},
			validateErr:  true,
			wantErr:      true,
			wantSaveCall: false,
		},
		{
			name: "repo save error",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "test", Model: "whisper-1"},
			},
			saveError:    errors.New("database error"),
			wantErr:      true,
			wantSaveCall: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &MockRepository{saveError: tt.saveError}
			service := NewService(repo, nil)

			err := service.SaveSettings(tt.settings)
			if tt.wantErr {
				if err == nil {
					t.Error("SaveSettings() expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("SaveSettings() unexpected error = %v", err)
				}
			}

			if repo.saveCalled != tt.wantSaveCall {
				t.Errorf("saveCalled = %v, want %v", repo.saveCalled, tt.wantSaveCall)
			}
		})
	}
}

func TestService_GetActiveProvider(t *testing.T) {
	tests := []struct {
		name     string
		settings *Settings
		wantType ProviderType
		wantErr  bool
	}{
		{
			name: "returns openai config",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "test"},
			},
			wantType: ProviderOpenAI,
		},
		{
			name: "returns google config",
			settings: &Settings{
				ActiveProvider: ProviderGoogle,
				Google:         &GoogleConfig{APIKey: "test"},
			},
			wantType: ProviderGoogle,
		},
		{
			name: "error when no config for active provider",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         nil,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &MockRepository{settings: tt.settings}
			service := NewService(repo, nil)

			got, err := service.GetActiveProvider()
			if tt.wantErr {
				if err == nil {
					t.Error("GetActiveProvider() expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("GetActiveProvider() error = %v", err)
				return
			}
			if got.GetProviderType() != tt.wantType {
				t.Errorf("GetProviderType() = %v, want %v", got.GetProviderType(), tt.wantType)
			}
		})
	}
}

func TestService_TestProviderConnection(t *testing.T) {
	tests := []struct {
		name       string
		factory    ProviderFactory
		config     ProviderConfig
		wantErr    bool
		errContain string
	}{
		{
			name: "successful connection",
			factory: &MockProviderFactory{
				testConnectionFunc: func(ctx context.Context, config ProviderConfig) error {
					return nil
				},
			},
			config: &OpenAIConfig{APIKey: "test"},
		},
		{
			name:       "nil factory returns error",
			factory:    nil,
			config:     &OpenAIConfig{APIKey: "test"},
			wantErr:    true,
			errContain: "factory not configured",
		},
		{
			name: "connection error",
			factory: &MockProviderFactory{
				testConnectionFunc: func(ctx context.Context, config ProviderConfig) error {
					return errors.New("connection failed")
				},
			},
			config:     &OpenAIConfig{APIKey: "test"},
			wantErr:    true,
			errContain: "connection failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := NewService(&MockRepository{}, tt.factory)

			err := service.TestProviderConnection(tt.config)
			if tt.wantErr {
				if err == nil {
					t.Error("TestProviderConnection() expected error, got nil")
					return
				}
				if tt.errContain != "" && !errors.Is(err, errors.New(tt.errContain)) {
					// Just check if error message contains expected text
					if err.Error() != tt.errContain && !strings.Contains(err.Error(), tt.errContain) {
						t.Errorf("error message does not contain %q: %v", tt.errContain, err)
					}
				}
			} else {
				if err != nil {
					t.Errorf("TestProviderConnection() unexpected error = %v", err)
				}
			}
		})
	}
}

func TestService_HasSettings(t *testing.T) {
	repo := &MockRepository{hasSettings: true}
	service := NewService(repo, nil)

	has, err := service.HasSettings()
	if err != nil {
		t.Errorf("HasSettings() error = %v", err)
	}
	if !has {
		t.Error("HasSettings() should return true")
	}
}

func TestService_LoadSettingsOrDefault(t *testing.T) {
	tests := []struct {
		name     string
		settings *Settings
	}{
		{
			name: "loads existing settings",
			settings: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "test"},
				Google:         &GoogleConfig{APIKey: "test"},
			},
		},
		{
			name:     "loads defaults when nil",
			settings: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &MockRepository{settings: tt.settings}
			service := NewService(repo, nil)

			got, err := service.LoadSettingsOrDefault()
			if err != nil {
				t.Errorf("LoadSettingsOrDefault() error = %v", err)
				return
			}

			if got.OpenAI == nil {
				t.Error("LoadSettingsOrDefault() should ensure OpenAI config is not nil")
			}
			if got.Google == nil {
				t.Error("LoadSettingsOrDefault() should ensure Google config is not nil")
			}
		})
	}
}

func TestCreateDefaultSettings(t *testing.T) {
	settings := CreateDefaultSettings()

	if settings.ActiveProvider != ProviderOpenAI {
		t.Errorf("ActiveProvider = %v, want %v", settings.ActiveProvider, ProviderOpenAI)
	}
	if settings.OpenAI == nil {
		t.Error("OpenAI config should not be nil")
	}
	if settings.OpenAI.Model != "whisper-1" {
		t.Errorf("OpenAI.Model = %v, want %v", settings.OpenAI.Model, "whisper-1")
	}
	if settings.Google == nil {
		t.Error("Google config should not be nil")
	}
}

func TestGetAPIKeyFromEnv(t *testing.T) {
	// Set test env vars
	os.Setenv("OPENAI_API_KEY", "test-openai-key")
	os.Setenv("GOOGLE_API_KEY", "test-google-key")
	defer func() {
		os.Unsetenv("OPENAI_API_KEY")
		os.Unsetenv("GOOGLE_API_KEY")
	}()

	tests := []struct {
		provider ProviderType
		want     string
	}{
		{
			provider: ProviderOpenAI,
			want:     "test-openai-key",
		},
		{
			provider: ProviderGoogle,
			want:     "test-google-key",
		},
		{
			provider: "unknown",
			want:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.provider.String(), func(t *testing.T) {
			got := GetAPIKeyFromEnv(tt.provider)
			if got != tt.want {
				t.Errorf("GetAPIKeyFromEnv() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestService_ImportFromEnv(t *testing.T) {
	tests := []struct {
		name           string
		openaiKey      string
		googleKey      string
		wantProvider   ProviderType
		wantSaveCalled bool
	}{
		{
			name:           "imports openai key",
			openaiKey:      "test-openai-key",
			wantProvider:   ProviderOpenAI,
			wantSaveCalled: true,
		},
		{
			name:           "imports google key when no openai",
			googleKey:      "test-google-key",
			wantProvider:   ProviderGoogle,
			wantSaveCalled: true,
		},
		{
			name:           "prefers openai when both available",
			openaiKey:      "test-openai-key",
			googleKey:      "test-google-key",
			wantProvider:   ProviderOpenAI,
			wantSaveCalled: true,
		},
		{
			name:           "no keys no save",
			wantSaveCalled: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set env vars
			if tt.openaiKey != "" {
				os.Setenv("OPENAI_API_KEY", tt.openaiKey)
				defer os.Unsetenv("OPENAI_API_KEY")
			}
			if tt.googleKey != "" {
				os.Setenv("GOOGLE_API_KEY", tt.googleKey)
				defer os.Unsetenv("GOOGLE_API_KEY")
			}

			repo := &MockRepository{}
			service := NewService(repo, nil)

			got, err := service.ImportFromEnv()
			if err != nil {
				t.Errorf("ImportFromEnv() error = %v", err)
				return
			}

			if repo.saveCalled != tt.wantSaveCalled {
				t.Errorf("saveCalled = %v, want %v", repo.saveCalled, tt.wantSaveCalled)
			}

			if tt.wantSaveCalled && got.ActiveProvider != tt.wantProvider {
				t.Errorf("ActiveProvider = %v, want %v", got.ActiveProvider, tt.wantProvider)
			}
		})
	}
}

func TestService_ImportFromEnv_SaveError(t *testing.T) {
	os.Setenv("OPENAI_API_KEY", "test-key")
	defer os.Unsetenv("OPENAI_API_KEY")

	repo := &MockRepository{saveError: errors.New("database error")}
	service := NewService(repo, nil)

	_, err := service.ImportFromEnv()
	if err == nil {
		t.Error("ImportFromEnv() should error on save failure")
	}
}

func TestSettingsChanged(t *testing.T) {
	tests := []struct {
		name string
		old  *Settings
		new  *Settings
		want bool
	}{
		{
			name: "nil settings considered changed",
			old:  nil,
			new:  &Settings{},
			want: true,
		},
		{
			name: "same settings not changed",
			old: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "test", Model: "whisper-1"},
			},
			new: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "test", Model: "whisper-1"},
			},
			want: false,
		},
		{
			name: "provider change detected",
			old: &Settings{
				ActiveProvider: ProviderOpenAI,
			},
			new: &Settings{
				ActiveProvider: ProviderGoogle,
			},
			want: true,
		},
		{
			name: "api key change detected",
			old: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "old-key"},
			},
			new: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "new-key"},
			},
			want: true,
		},
		{
			name: "model change not detected",
			old: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "test", Model: "whisper-1"},
			},
			new: &Settings{
				ActiveProvider: ProviderOpenAI,
				OpenAI:         &OpenAIConfig{APIKey: "test", Model: "whisper-2"},
			},
			want: false, // Model changes are not considered meaningful
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SettingsChanged(tt.old, tt.new)
			if got != tt.want {
				t.Errorf("SettingsChanged() = %v, want %v", got, tt.want)
			}
		})
	}
}
