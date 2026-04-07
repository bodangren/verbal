package ai

import (
	"context"
	"testing"

	"verbal/internal/settings"
)

func TestFactory_CreateProvider_OpenAI(t *testing.T) {
	factory := NewFactory()

	config := &settings.OpenAIConfig{
		APIKey: "test-api-key",
		Model:  "whisper-1",
	}

	provider, err := factory.CreateProvider(config)
	if err != nil {
		t.Fatalf("CreateProvider failed: %v", err)
	}

	if provider == nil {
		t.Error("Expected provider, got nil")
	}

	if provider.Name() != "OpenAI" {
		t.Errorf("Expected OpenAI provider, got %s", provider.Name())
	}
}

func TestFactory_CreateProvider_Google(t *testing.T) {
	factory := NewFactory()

	config := &settings.GoogleConfig{
		APIKey: "test-api-key",
	}

	provider, err := factory.CreateProvider(config)
	if err != nil {
		t.Fatalf("CreateProvider failed: %v", err)
	}

	if provider == nil {
		t.Error("Expected provider, got nil")
	}

	if provider.Name() != "Google" {
		t.Errorf("Expected Google provider, got %s", provider.Name())
	}
}

func TestFactory_CreateProvider_NilConfig(t *testing.T) {
	factory := NewFactory()

	_, err := factory.CreateProvider(nil)
	if err == nil {
		t.Error("Expected error for nil config")
	}
}

func TestFactory_CreateProvider_EmptyAPIKey(t *testing.T) {
	factory := NewFactory()

	// OpenAI with empty key
	openaiConfig := &settings.OpenAIConfig{
		APIKey: "",
		Model:  "whisper-1",
	}
	_, err := factory.CreateProvider(openaiConfig)
	if err == nil {
		t.Error("Expected error for empty OpenAI API key")
	}

	// Google with empty key
	googleConfig := &settings.GoogleConfig{
		APIKey: "",
	}
	_, err = factory.CreateProvider(googleConfig)
	if err == nil {
		t.Error("Expected error for empty Google API key")
	}
}

func TestFactory_CreateProviderFromSettings(t *testing.T) {
	factory := NewFactory()

	s := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI: &settings.OpenAIConfig{
			APIKey: "test-key",
			Model:  "whisper-1",
		},
	}

	provider, err := factory.CreateProviderFromSettings(s)
	if err != nil {
		t.Fatalf("CreateProviderFromSettings failed: %v", err)
	}

	if provider == nil {
		t.Error("Expected provider, got nil")
	}
}

func TestFactory_CreateProviderFromSettings_Nil(t *testing.T) {
	factory := NewFactory()

	_, err := factory.CreateProviderFromSettings(nil)
	if err == nil {
		t.Error("Expected error for nil settings")
	}
}

func TestFactory_CreateProviderFromSettings_NoActiveConfig(t *testing.T) {
	factory := NewFactory()

	s := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI:         nil,
	}

	_, err := factory.CreateProviderFromSettings(s)
	if err == nil {
		t.Error("Expected error when no active provider config")
	}
}

func TestFactory_TestConnection(t *testing.T) {
	factory := NewFactory()

	// Test with valid config - should succeed (currently just validates creation)
	config := &settings.OpenAIConfig{
		APIKey: "test-key",
		Model:  "whisper-1",
	}

	err := factory.TestConnection(context.Background(), config)
	if err != nil {
		t.Errorf("TestConnection failed: %v", err)
	}
}

func TestFactory_TestConnection_InvalidConfig(t *testing.T) {
	factory := NewFactory()

	// Test with invalid config
	config := &settings.OpenAIConfig{
		APIKey: "",
		Model:  "whisper-1",
	}

	err := factory.TestConnection(context.Background(), config)
	if err == nil {
		t.Error("Expected error for invalid config")
	}
}

// Verify Factory implements settings.ProviderFactory
func TestFactory_ImplementsProviderFactory(t *testing.T) {
	var _ settings.ProviderFactory = (*Factory)(nil)
}
