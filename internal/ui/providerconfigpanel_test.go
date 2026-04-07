package ui

import (
	"testing"

	"verbal/internal/settings"
)

func TestOpenAIConfigPanel_Creation(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewOpenAIConfigPanel()
	if panel == nil {
		t.Fatal("NewOpenAIConfigPanel returned nil")
	}

	if panel.Widget() == nil {
		t.Error("Widget() returned nil")
	}
}

func TestOpenAIConfigPanel_GetSetConfig(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewOpenAIConfigPanel()

	// Test setting and getting config
	config := &settings.OpenAIConfig{
		APIKey: "test-api-key",
		Model:  "whisper-1",
	}
	panel.SetConfig(config)

	retrieved := panel.GetConfig()
	if retrieved.APIKey != "test-api-key" {
		t.Errorf("Expected API key 'test-api-key', got '%s'", retrieved.APIKey)
	}
	if retrieved.Model != "whisper-1" {
		t.Errorf("Expected model 'whisper-1', got '%s'", retrieved.Model)
	}
}

func TestOpenAIConfigPanel_SetConfig_Nil(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewOpenAIConfigPanel()

	// Set some values first
	panel.SetConfig(&settings.OpenAIConfig{
		APIKey: "test-key",
		Model:  "whisper-1",
	})

	// Set nil config (should clear values and reset to default)
	panel.SetConfig(nil)

	retrieved := panel.GetConfig()
	if retrieved.APIKey != "" {
		t.Errorf("Expected empty API key, got '%s'", retrieved.APIKey)
	}
}

func TestOpenAIConfigPanel_Validate(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewOpenAIConfigPanel()

	// Should be invalid with empty API key
	if panel.Validate() {
		t.Error("Expected Validate() to return false with empty API key")
	}

	// Set API key
	panel.SetConfig(&settings.OpenAIConfig{
		APIKey: "valid-key",
		Model:  "whisper-1",
	})

	// Should be valid now
	if !panel.Validate() {
		t.Error("Expected Validate() to return true with API key set")
	}
}

func TestOpenAIConfigPanel_Clear(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewOpenAIConfigPanel()

	// Set values
	panel.SetConfig(&settings.OpenAIConfig{
		APIKey: "test-key",
		Model:  "custom-model",
	})

	// Clear
	panel.Clear()

	retrieved := panel.GetConfig()
	if retrieved.APIKey != "" {
		t.Errorf("Expected empty API key after Clear(), got '%s'", retrieved.APIKey)
	}
	if retrieved.Model != "whisper-1" {
		t.Errorf("Expected default model 'whisper-1' after Clear(), got '%s'", retrieved.Model)
	}
}

func TestGoogleConfigPanel_Creation(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewGoogleConfigPanel()
	if panel == nil {
		t.Fatal("NewGoogleConfigPanel returned nil")
	}

	if panel.Widget() == nil {
		t.Error("Widget() returned nil")
	}
}

func TestGoogleConfigPanel_GetSetConfig(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewGoogleConfigPanel()

	// Test setting and getting config
	config := &settings.GoogleConfig{
		APIKey: "google-api-key",
	}
	panel.SetConfig(config)

	retrieved := panel.GetConfig()
	if retrieved.APIKey != "google-api-key" {
		t.Errorf("Expected API key 'google-api-key', got '%s'", retrieved.APIKey)
	}
}

func TestGoogleConfigPanel_SetConfig_Nil(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewGoogleConfigPanel()

	// Set some values first
	panel.SetConfig(&settings.GoogleConfig{
		APIKey: "test-key",
	})

	// Set nil config
	panel.SetConfig(nil)

	retrieved := panel.GetConfig()
	if retrieved.APIKey != "" {
		t.Errorf("Expected empty API key, got '%s'", retrieved.APIKey)
	}
}

func TestGoogleConfigPanel_Validate(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewGoogleConfigPanel()

	// Should be invalid with empty API key
	if panel.Validate() {
		t.Error("Expected Validate() to return false with empty API key")
	}

	// Set API key
	panel.SetConfig(&settings.GoogleConfig{
		APIKey: "valid-key",
	})

	// Should be valid now
	if !panel.Validate() {
		t.Error("Expected Validate() to return true with API key set")
	}
}

func TestGoogleConfigPanel_Clear(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	panel := NewGoogleConfigPanel()

	// Set values
	panel.SetConfig(&settings.GoogleConfig{
		APIKey: "test-key",
	})

	// Clear
	panel.Clear()

	retrieved := panel.GetConfig()
	if retrieved.APIKey != "" {
		t.Errorf("Expected empty API key after Clear(), got '%s'", retrieved.APIKey)
	}
}
