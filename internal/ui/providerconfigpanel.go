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

// LocalConfigPanel provides a form for configuring local Whisper transcription.
type LocalConfigPanel struct {
	root        *gtk.Box
	modelPathEntry *gtk.Entry
	modelSizeCombo *gtk.ComboBoxText
}

// NewLocalConfigPanel creates a new local configuration panel.
func NewLocalConfigPanel() *LocalConfigPanel {
	root := gtk.NewBox(gtk.OrientationVertical, 12)
	root.SetMarginStart(18)
	root.SetMarginEnd(18)
	root.SetMarginTop(12)
	root.SetMarginBottom(12)

	// Model Path section
	pathLabel := gtk.NewLabel("Model Path")
	pathLabel.SetHAlign(gtk.AlignStart)
	pathLabel.AddCSSClass("setting-label")

	pathEntry := gtk.NewEntry()
	pathEntry.SetHExpand(true)
	pathEntry.SetPlaceholderText("/path/to/ggml-base.bin")
	pathEntry.SetTooltipText("Path to the whisper.cpp model file (e.g., /path/to/ggml-base.bin)")

	// Model Size section
	sizeLabel := gtk.NewLabel("Model Size")
	sizeLabel.SetHAlign(gtk.AlignStart)
	sizeLabel.AddCSSClass("setting-label")
	sizeLabel.SetMarginTop(8)

	sizeCombo := gtk.NewComboBoxText()
	sizeCombo.Append("tiny", "Tiny (39 MB) - Fastest, lowest accuracy")
	sizeCombo.Append("base", "Base (74 MB) - Good balance")
	sizeCombo.Append("small", "Small (242 MB) - Better accuracy")
	sizeCombo.Append("medium", "Medium (742 MB) - High accuracy")
	sizeCombo.Append("large", "Large (1.5 GB) - Best accuracy")
	sizeCombo.SetActive(1)
	sizeCombo.SetHExpand(true)

	// Help text
	helpLabel := gtk.NewLabel("Download models from huggingface.co/ggerganov/whisper.cpp")
	helpLabel.AddCSSClass("dim-label")
	helpLabel.SetHAlign(gtk.AlignStart)
	helpLabel.SetMarginTop(8)
	helpLabel.SetWrap(true)

	root.Append(pathLabel)
	root.Append(pathEntry)
	root.Append(sizeLabel)
	root.Append(sizeCombo)
	root.Append(helpLabel)

	return &LocalConfigPanel{
		root:          root,
		modelPathEntry: pathEntry,
		modelSizeCombo: sizeCombo,
	}
}

// Widget returns the root GTK widget.
func (p *LocalConfigPanel) Widget() *gtk.Box {
	return p.root
}

// GetConfig returns the current configuration from the form.
func (p *LocalConfigPanel) GetConfig() *settings.LocalConfig {
	return &settings.LocalConfig{
		ModelPath: p.modelPathEntry.Text(),
		ModelSize: p.modelSizeCombo.ActiveText(),
	}
}

// SetConfig populates the form with the given configuration.
func (p *LocalConfigPanel) SetConfig(config *settings.LocalConfig) {
	if config == nil {
		p.modelPathEntry.SetText("")
		p.modelSizeCombo.SetActive(1)
		return
	}
	p.modelPathEntry.SetText(config.ModelPath)
	if config.ModelSize != "" {
		switch config.ModelSize {
		case "tiny":
			p.modelSizeCombo.SetActive(0)
		case "base":
			p.modelSizeCombo.SetActive(1)
		case "small":
			p.modelSizeCombo.SetActive(2)
		case "medium":
			p.modelSizeCombo.SetActive(3)
		case "large":
			p.modelSizeCombo.SetActive(4)
		default:
			p.modelSizeCombo.SetActive(1)
		}
	}
}

// Validate returns true if the form has valid input.
func (p *LocalConfigPanel) Validate() bool {
	return p.modelPathEntry.Text() != ""
}

// Clear resets the form to empty values.
func (p *LocalConfigPanel) Clear() {
	p.modelPathEntry.SetText("")
	p.modelSizeCombo.SetActive(1)
}
