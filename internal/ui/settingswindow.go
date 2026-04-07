package ui

import (
	"fmt"

	"github.com/diamondburned/gotk4/pkg/glib/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/settings"
)

// SettingsWindow provides a dialog for configuring AI provider settings.
type SettingsWindow struct {
	dialog *gtk.Dialog

	// Provider selector
	providerCombo *gtk.ComboBoxText

	// Provider-specific panels
	stack       *gtk.Stack
	openaiPanel *OpenAIConfigPanel
	googlePanel *GoogleConfigPanel

	// Status
	statusLabel     *gtk.Label
	progressSpinner *gtk.Spinner

	// Buttons
	testButton *gtk.Button
	saveButton *gtk.Button

	// Callbacks
	onSave func(*settings.Settings)
	onTest func(settings.ProviderConfig) error

	// Current settings (working copy)
	currentSettings *settings.Settings
}

// NewSettingsWindow creates a new settings dialog.
// The parent window is used for modal dialog positioning.
func NewSettingsWindow(parent *gtk.Window) *SettingsWindow {
	dialog := gtk.NewDialog()
	dialog.SetTitle("Settings")
	dialog.SetTransientFor(parent)
	dialog.SetModal(true)
	dialog.SetDefaultSize(500, 400)
	dialog.SetResizable(false)

	// Get content area
	content := dialog.ContentArea()
	content.SetSpacing(0)

	// Main container
	mainBox := gtk.NewBox(gtk.OrientationVertical, 0)
	mainBox.SetVExpand(true)
	content.Append(mainBox)

	// Header section with provider selector
	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(18)
	headerBox.SetMarginEnd(18)
	headerBox.SetMarginTop(18)
	headerBox.SetMarginBottom(12)

	// Title
	titleLabel := gtk.NewLabel("AI Provider Configuration")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHAlign(gtk.AlignStart)

	// Provider selector
	selectorBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	selectorBox.SetHAlign(gtk.AlignFill)

	providerLabel := gtk.NewLabel("Provider")
	providerLabel.SetHAlign(gtk.AlignStart)
	providerLabel.SetWidthChars(12)

	// Provider selector combo
	providerCombo := gtk.NewComboBoxText()
	providerCombo.Append("openai", "OpenAI Whisper")
	providerCombo.Append("google", "Google Speech-to-Text")
	providerCombo.SetActive(0)
	providerCombo.SetHExpand(true)
	providerCombo.SetTooltipText("Select the AI transcription provider to use")

	selectorBox.Append(providerLabel)
	selectorBox.Append(providerCombo)

	headerBox.Append(titleLabel)
	headerBox.Append(selectorBox)
	mainBox.Append(headerBox)

	// Separator
	separator := gtk.NewSeparator(gtk.OrientationHorizontal)
	mainBox.Append(separator)

	// Stack for provider panels
	stack := gtk.NewStack()
	stack.SetVExpand(true)
	stack.SetMarginStart(6)
	stack.SetMarginEnd(6)
	stack.SetTransitionType(gtk.StackTransitionTypeCrossfade)
	stack.SetTransitionDuration(150)

	openaiPanel := NewOpenAIConfigPanel()
	googlePanel := NewGoogleConfigPanel()

	stack.AddNamed(openaiPanel.Widget(), "openai")
	stack.AddNamed(googlePanel.Widget(), "google")

	mainBox.Append(stack)

	// Status area
	statusBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	statusBox.SetMarginStart(18)
	statusBox.SetMarginEnd(18)
	statusBox.SetMarginTop(6)
	statusBox.SetMarginBottom(6)
	statusBox.SetHAlign(gtk.AlignFill)

	progressSpinner := gtk.NewSpinner()
	progressSpinner.SetVisible(false)

	statusLabel := gtk.NewLabel("")
	statusLabel.AddCSSClass("status-label")
	statusLabel.SetHAlign(gtk.AlignStart)
	statusLabel.SetVisible(false)

	statusBox.Append(progressSpinner)
	statusBox.Append(statusLabel)
	mainBox.Append(statusBox)

	// Button box
	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	buttonBox.SetMarginStart(18)
	buttonBox.SetMarginEnd(18)
	buttonBox.SetMarginTop(12)
	buttonBox.SetMarginBottom(18)
	buttonBox.SetHAlign(gtk.AlignEnd)

	testButton := gtk.NewButtonWithLabel("Test Connection")
	testButton.AddCSSClass("suggested-action")

	saveButton := gtk.NewButtonWithLabel("Save")
	saveButton.AddCSSClass("suggested-action")

	cancelButton := gtk.NewButtonWithLabel("Cancel")

	buttonBox.Append(testButton)
	buttonBox.Append(cancelButton)
	buttonBox.Append(saveButton)
	mainBox.Append(buttonBox)

	sw := &SettingsWindow{
		dialog:          dialog,
		providerCombo:   providerCombo,
		stack:           stack,
		openaiPanel:     openaiPanel,
		googlePanel:     googlePanel,
		statusLabel:     statusLabel,
		progressSpinner: progressSpinner,
		testButton:      testButton,
		saveButton:      saveButton,
		currentSettings: settings.CreateDefaultSettings(),
	}

	// Wire up signals
	providerCombo.ConnectChanged(func() {
		sw.onProviderChanged()
	})

	testButton.ConnectClicked(func() {
		sw.onTestClicked()
	})

	saveButton.ConnectClicked(func() {
		sw.onSaveClicked()
	})

	cancelButton.ConnectClicked(func() {
		dialog.Close()
	})

	// Set initial provider
	sw.onProviderChanged()

	return sw
}

// Show displays the settings dialog.
func (sw *SettingsWindow) Show() {
	sw.dialog.Show()
}

// Hide hides the settings dialog.
func (sw *SettingsWindow) Hide() {
	sw.dialog.Hide()
}

// Close closes and destroys the settings dialog.
func (sw *SettingsWindow) Close() {
	sw.dialog.Close()
}

// SetSettings populates the dialog with existing settings.
func (sw *SettingsWindow) SetSettings(s *settings.Settings) {
	if s == nil {
		sw.currentSettings = settings.CreateDefaultSettings()
		return
	}

	sw.currentSettings = s.Clone()

	// Set provider selection
	switch s.ActiveProvider {
	case settings.ProviderOpenAI:
		sw.providerCombo.SetActive(0)
		sw.stack.SetVisibleChildName("openai")
		if s.OpenAI != nil {
			sw.openaiPanel.SetConfig(s.OpenAI)
		}
	case settings.ProviderGoogle:
		sw.providerCombo.SetActive(1)
		sw.stack.SetVisibleChildName("google")
		if s.Google != nil {
			sw.googlePanel.SetConfig(s.Google)
		}
	}
}

// GetSettings returns the current settings from the form.
func (sw *SettingsWindow) GetSettings() *settings.Settings {
	s := &settings.Settings{}

	// Get provider type
	switch sw.providerCombo.Active() {
	case 0:
		s.ActiveProvider = settings.ProviderOpenAI
		s.OpenAI = sw.openaiPanel.GetConfig()
	case 1:
		s.ActiveProvider = settings.ProviderGoogle
		s.Google = sw.googlePanel.GetConfig()
	}

	return s
}

// SetOnSave sets the callback for when settings are saved.
func (sw *SettingsWindow) SetOnSave(callback func(*settings.Settings)) {
	sw.onSave = callback
}

// SetOnTest sets the callback for testing provider connection.
func (sw *SettingsWindow) SetOnTest(callback func(settings.ProviderConfig) error) {
	sw.onTest = callback
}

// onProviderChanged handles provider selection change.
func (sw *SettingsWindow) onProviderChanged() {
	switch sw.providerCombo.Active() {
	case 0:
		sw.stack.SetVisibleChildName("openai")
	case 1:
		sw.stack.SetVisibleChildName("google")
	}
	sw.clearStatus()
}

// onTestClicked handles the test connection button.
func (sw *SettingsWindow) onTestClicked() {
	var config settings.ProviderConfig

	switch sw.providerCombo.Active() {
	case 0:
		config = sw.openaiPanel.GetConfig()
		if !sw.openaiPanel.Validate() {
			sw.showError("API Key is required")
			return
		}
	case 1:
		config = sw.googlePanel.GetConfig()
		if !sw.googlePanel.Validate() {
			sw.showError("API Key is required")
			return
		}
	}

	if sw.onTest == nil {
		sw.showError("Test not configured")
		return
	}

	// Show loading state
	sw.setLoading(true)
	sw.showStatus("Testing connection...")

	// Run test in background
	go func() {
		err := sw.onTest(config)
		glib.IdleAdd(func() {
			sw.setLoading(false)
			if err != nil {
				sw.showError(fmt.Sprintf("Connection failed: %v", err))
			} else {
				sw.showSuccess("Connection successful!")
			}
		})
	}()
}

// onSaveClicked handles the save button.
func (sw *SettingsWindow) onSaveClicked() {
	s := sw.GetSettings()

	// Validate
	if err := s.Validate(); err != nil {
		sw.showError(fmt.Sprintf("Validation error: %v", err))
		return
	}

	if sw.onSave != nil {
		sw.onSave(s)
	}

	sw.dialog.Close()
}

// setLoading shows or hides the loading spinner.
func (sw *SettingsWindow) setLoading(loading bool) {
	sw.progressSpinner.SetVisible(loading)
	if loading {
		sw.progressSpinner.Start()
		sw.testButton.SetSensitive(false)
		sw.saveButton.SetSensitive(false)
	} else {
		sw.progressSpinner.Stop()
		sw.testButton.SetSensitive(true)
		sw.saveButton.SetSensitive(true)
	}
}

// showStatus displays a status message.
func (sw *SettingsWindow) showStatus(message string) {
	sw.statusLabel.SetText(message)
	sw.statusLabel.SetVisible(true)
	sw.statusLabel.RemoveCSSClass("error-label")
	sw.statusLabel.RemoveCSSClass("success-label")
}

// showError displays an error message.
func (sw *SettingsWindow) showError(message string) {
	sw.statusLabel.SetText(message)
	sw.statusLabel.SetVisible(true)
	sw.statusLabel.AddCSSClass("error-label")
	sw.statusLabel.RemoveCSSClass("success-label")
}

// showSuccess displays a success message.
func (sw *SettingsWindow) showSuccess(message string) {
	sw.statusLabel.SetText(message)
	sw.statusLabel.SetVisible(true)
	sw.statusLabel.AddCSSClass("success-label")
	sw.statusLabel.RemoveCSSClass("error-label")
}

// clearStatus hides the status label.
func (sw *SettingsWindow) clearStatus() {
	sw.statusLabel.SetVisible(false)
	sw.statusLabel.RemoveCSSClass("error-label")
	sw.statusLabel.RemoveCSSClass("success-label")
}
