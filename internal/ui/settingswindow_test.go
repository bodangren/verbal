package ui

import (
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/settings"
)

func TestSettingsWindow_Creation(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	// Create a parent window (required for transient parent)
	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)
	if window == nil {
		t.Fatal("NewSettingsWindow returned nil")
	}

	// Verify window is created with expected initial state
	if window.currentSettings == nil {
		t.Error("currentSettings should not be nil")
	}
}

func TestSettingsWindow_SetGetSettings(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)

	// Test setting and getting OpenAI settings
	openaiSettings := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI: &settings.OpenAIConfig{
			APIKey: "openai-key",
			Model:  "whisper-1",
		},
		Google: &settings.GoogleConfig{
			APIKey: "",
		},
	}

	window.SetSettings(openaiSettings)

	// Verify settings were set
	if window.currentSettings.ActiveProvider != settings.ProviderOpenAI {
		t.Errorf("Expected OpenAI provider, got %s", window.currentSettings.ActiveProvider)
	}

	// Get settings back
	retrieved := window.GetSettings()
	if retrieved.ActiveProvider != settings.ProviderOpenAI {
		t.Errorf("Expected OpenAI provider from GetSettings, got %s", retrieved.ActiveProvider)
	}
	if retrieved.OpenAI == nil || retrieved.OpenAI.APIKey != "openai-key" {
		t.Error("OpenAI config not retrieved correctly")
	}
}

func TestSettingsWindow_SetGetSettings_Google(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)

	// Test setting and getting Google settings
	googleSettings := &settings.Settings{
		ActiveProvider: settings.ProviderGoogle,
		OpenAI:         &settings.OpenAIConfig{},
		Google: &settings.GoogleConfig{
			APIKey: "google-key",
		},
	}

	window.SetSettings(googleSettings)

	// Get settings back
	retrieved := window.GetSettings()
	if retrieved.ActiveProvider != settings.ProviderGoogle {
		t.Errorf("Expected Google provider, got %s", retrieved.ActiveProvider)
	}
	if retrieved.Google == nil || retrieved.Google.APIKey != "google-key" {
		t.Error("Google config not retrieved correctly")
	}
}

func TestSettingsWindow_SetSettings_Nil(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)

	// Set nil settings (should create default settings)
	window.SetSettings(nil)

	if window.currentSettings == nil {
		t.Error("currentSettings should not be nil after SetSettings(nil)")
	}

	// Should have default provider
	if !window.currentSettings.ActiveProvider.Valid() {
		t.Error("Should have valid default provider after SetSettings(nil)")
	}
}

func TestSettingsWindow_SettingsChanged(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)

	// Track if callback was called
	saveCalled := false
	var savedSettings *settings.Settings

	window.SetOnSave(func(s *settings.Settings) {
		saveCalled = true
		savedSettings = s
	})

	// Set settings and simulate save callback directly
	testSettings := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI: &settings.OpenAIConfig{
			APIKey: "test-key",
			Model:  "whisper-1",
		},
	}
	window.SetSettings(testSettings)

	// Verify callback is wired
	if window.onSave == nil {
		t.Error("onSave callback not set")
	}

	// Call save callback directly
	window.onSave(testSettings)

	if !saveCalled {
		t.Error("Save callback was not called")
	}
	if savedSettings == nil {
		t.Error("Saved settings should not be nil")
	}
}

func TestSettingsWindow_TestCallback(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)

	// Track if test callback was called
	testCalled := false
	window.SetOnTest(func(config settings.ProviderConfig) error {
		testCalled = true
		return nil
	})

	// Set up valid settings
	window.SetSettings(&settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI: &settings.OpenAIConfig{
			APIKey: "test-key",
			Model:  "whisper-1",
		},
	})

	// Verify callback is wired
	if window.onTest == nil {
		t.Error("onTest callback not set")
	}

	// Suppress unused variable warning
	_ = testCalled
}

func TestSettingsWindow_GetSettings_WithEmptyPanels(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)

	// Get settings without setting anything (empty panels)
	s := window.GetSettings()

	// Should still return a settings object
	if s == nil {
		t.Fatal("GetSettings returned nil")
	}

	// OpenAI should be selected by default (active index 0)
	if s.ActiveProvider != settings.ProviderOpenAI {
		t.Errorf("Expected OpenAI as default, got %s", s.ActiveProvider)
	}
}

func TestSettingsWindow_ProviderPanels(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	parent := gtk.NewWindow()
	defer parent.Close()

	window := NewSettingsWindow(parent)

	// Verify panels exist
	if window.openaiPanel == nil {
		t.Error("openaiPanel should not be nil")
	}
	if window.googlePanel == nil {
		t.Error("googlePanel should not be nil")
	}

	// Verify panels have widgets
	if window.openaiPanel.Widget() == nil {
		t.Error("openaiPanel.Widget() should not be nil")
	}
	if window.googlePanel.Widget() == nil {
		t.Error("googlePanel.Widget() should not be nil")
	}
}
