package ui

import (
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/settings"
)

// OpenAIConfigPanel provides a form for configuring OpenAI Whisper API settings.
type OpenAIConfigPanel struct {
	root        *gtk.Box
	apiKeyEntry *gtk.PasswordEntry
	modelEntry  *gtk.Entry
}

// NewOpenAIConfigPanel creates a new OpenAI configuration panel.
func NewOpenAIConfigPanel() *OpenAIConfigPanel {
	root := gtk.NewBox(gtk.OrientationVertical, 12)
	root.SetMarginStart(18)
	root.SetMarginEnd(18)
	root.SetMarginTop(12)
	root.SetMarginBottom(12)

	// API Key section
	apiKeyLabel := gtk.NewLabel("API Key")
	apiKeyLabel.SetHAlign(gtk.AlignStart)
	apiKeyLabel.AddCSSClass("setting-label")

	apiKeyEntry := gtk.NewPasswordEntry()
	apiKeyEntry.SetShowPeekIcon(true)
	apiKeyEntry.SetHExpand(true)
	apiKeyEntry.SetTooltipText("Your OpenAI API key (starts with sk-...)")

	// Model section
	modelLabel := gtk.NewLabel("Model")
	modelLabel.SetHAlign(gtk.AlignStart)
	modelLabel.AddCSSClass("setting-label")
	modelLabel.SetMarginTop(8)

	modelEntry := gtk.NewEntry()
	modelEntry.SetText("whisper-1")
	modelEntry.SetHExpand(true)
	modelEntry.SetTooltipText("The Whisper model to use (default: whisper-1)")

	// Help text
	helpLabel := gtk.NewLabel("Get your API key from platform.openai.com/api-keys")
	helpLabel.AddCSSClass("dim-label")
	helpLabel.SetHAlign(gtk.AlignStart)
	helpLabel.SetMarginTop(8)
	helpLabel.SetWrap(true)

	// Assemble
	root.Append(apiKeyLabel)
	root.Append(apiKeyEntry)
	root.Append(modelLabel)
	root.Append(modelEntry)
	root.Append(helpLabel)

	return &OpenAIConfigPanel{
		root:        root,
		apiKeyEntry: apiKeyEntry,
		modelEntry:  modelEntry,
	}
}

// Widget returns the root GTK widget.
func (p *OpenAIConfigPanel) Widget() *gtk.Box {
	return p.root
}

// GetConfig returns the current configuration from the form.
func (p *OpenAIConfigPanel) GetConfig() *settings.OpenAIConfig {
	return &settings.OpenAIConfig{
		APIKey: p.apiKeyEntry.Text(),
		Model:  p.modelEntry.Text(),
	}
}

// SetConfig populates the form with the given configuration.
func (p *OpenAIConfigPanel) SetConfig(config *settings.OpenAIConfig) {
	if config == nil {
		p.apiKeyEntry.SetText("")
		p.modelEntry.SetText("whisper-1")
		return
	}
	p.apiKeyEntry.SetText(config.APIKey)
	if config.Model != "" {
		p.modelEntry.SetText(config.Model)
	} else {
		p.modelEntry.SetText("whisper-1")
	}
}

// Validate returns true if the form has valid input.
func (p *OpenAIConfigPanel) Validate() bool {
	return p.apiKeyEntry.Text() != ""
}

// Clear resets the form to empty values.
func (p *OpenAIConfigPanel) Clear() {
	p.apiKeyEntry.SetText("")
	p.modelEntry.SetText("whisper-1")
}

// GoogleConfigPanel provides a form for configuring Google Speech-to-Text API settings.
type GoogleConfigPanel struct {
	root        *gtk.Box
	apiKeyEntry *gtk.PasswordEntry
}

// NewGoogleConfigPanel creates a new Google configuration panel.
func NewGoogleConfigPanel() *GoogleConfigPanel {
	root := gtk.NewBox(gtk.OrientationVertical, 12)
	root.SetMarginStart(18)
	root.SetMarginEnd(18)
	root.SetMarginTop(12)
	root.SetMarginBottom(12)

	// API Key section
	apiKeyLabel := gtk.NewLabel("API Key")
	apiKeyLabel.SetHAlign(gtk.AlignStart)
	apiKeyLabel.AddCSSClass("setting-label")

	apiKeyEntry := gtk.NewPasswordEntry()
	apiKeyEntry.SetShowPeekIcon(true)
	apiKeyEntry.SetHExpand(true)
	apiKeyEntry.SetTooltipText("Your Google Cloud API key")

	// Help text
	helpLabel := gtk.NewLabel("Get your API key from Google Cloud Console (Speech-to-Text API)")
	helpLabel.AddCSSClass("dim-label")
	helpLabel.SetHAlign(gtk.AlignStart)
	helpLabel.SetMarginTop(8)
	helpLabel.SetWrap(true)

	// Assemble
	root.Append(apiKeyLabel)
	root.Append(apiKeyEntry)
	root.Append(helpLabel)

	return &GoogleConfigPanel{
		root:        root,
		apiKeyEntry: apiKeyEntry,
	}
}

// Widget returns the root GTK widget.
func (p *GoogleConfigPanel) Widget() *gtk.Box {
	return p.root
}

// GetConfig returns the current configuration from the form.
func (p *GoogleConfigPanel) GetConfig() *settings.GoogleConfig {
	return &settings.GoogleConfig{
		APIKey: p.apiKeyEntry.Text(),
	}
}

// SetConfig populates the form with the given configuration.
func (p *GoogleConfigPanel) SetConfig(config *settings.GoogleConfig) {
	if config == nil {
		p.apiKeyEntry.SetText("")
		return
	}
	p.apiKeyEntry.SetText(config.APIKey)
}

// Validate returns true if the form has valid input.
func (p *GoogleConfigPanel) Validate() bool {
	return p.apiKeyEntry.Text() != ""
}

// Clear resets the form to empty values.
func (p *GoogleConfigPanel) Clear() {
	p.apiKeyEntry.SetText("")
}
