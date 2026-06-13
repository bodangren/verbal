package ui

import (
	"context"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/db"
	"verbal/internal/media"
)

// PresetListModel is the interface the ExportDialog uses to fetch and
// save presets. Production code adapts *db.PresetRepository; tests use
// a stub (mirrors BatchQueueModel at internal/ui/batchqueuepanel.go:21).
type PresetListModel interface {
	ListPresets(ctx context.Context) ([]*db.Preset, error)
	SaveCustomPreset(ctx context.Context, p *db.Preset) error
}

// ExportType represents the type of export operation.
type ExportType int

const (
	// ExportSingle exports a single recording.
	ExportSingle ExportType = iota
	// ExportAll exports all recordings.
	ExportAll
)

// ExportDialog provides a dialog for exporting recordings.
type ExportDialog struct {
	dialog *gtk.Dialog

	// Export configuration
	exportType ExportType
	recording  *db.Recording

	// UI Components
	exportSingleRadio *gtk.CheckButton
	exportAllRadio    *gtk.CheckButton
	destinationEntry  *gtk.Entry
	browseButton      *gtk.Button
	progressBar       *gtk.ProgressBar
	statusLabel       *gtk.Label
	exportButton      *gtk.Button
	cancelButton      *gtk.Button

	// Preset UI
	presetModel     PresetListModel
	presetDropdown  *gtk.DropDown
	presets         []*db.Preset
	selectedPreset  *db.Preset
	onPresetSelected func(*db.Preset)
	pipelineConfig  *media.PipelineConfig

	// State
	progressPercent int
	progressMessage string
	destPath        string

	// Callbacks
	onExport func(recordingID string, destPath string)
	onCancel func()
}

// NewExportDialog creates a new export dialog.
func NewExportDialog(parent *gtk.Window) *ExportDialog {
	dialog := gtk.NewDialog()
	dialog.SetTitle("Export Recording")
	dialog.SetTransientFor(parent)
	dialog.SetModal(true)
	dialog.SetDefaultSize(500, 350)
	dialog.SetResizable(false)

	// Get content area
	content := dialog.ContentArea()
	content.SetSpacing(0)

	// Main container
	mainBox := gtk.NewBox(gtk.OrientationVertical, 0)
	mainBox.SetVExpand(true)
	content.Append(mainBox)

	// Header section
	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(18)
	headerBox.SetMarginEnd(18)
	headerBox.SetMarginTop(18)
	headerBox.SetMarginBottom(12)

	// Title
	titleLabel := gtk.NewLabel("Export Recording")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHAlign(gtk.AlignStart)
	headerBox.Append(titleLabel)

	// Export type selection
	typeBox := gtk.NewBox(gtk.OrientationVertical, 8)
	typeLabel := gtk.NewLabel("Export Options")
	typeLabel.SetHAlign(gtk.AlignStart)
	typeLabel.AddCSSClass("heading")
	typeBox.Append(typeLabel)

	// Single recording radio
	exportSingleRadio := gtk.NewCheckButtonWithLabel("Export single recording")
	exportSingleRadio.SetActive(true)
	typeBox.Append(exportSingleRadio)

	// All recordings radio
	exportAllRadio := gtk.NewCheckButtonWithLabel("Export all recordings")
	exportAllRadio.SetGroup(exportSingleRadio)
	typeBox.Append(exportAllRadio)

	headerBox.Append(typeBox)

	// Separator
	separator := gtk.NewSeparator(gtk.OrientationHorizontal)
	headerBox.Append(separator)

	// Destination section
	destBox := gtk.NewBox(gtk.OrientationVertical, 8)
	destLabel := gtk.NewLabel("Destination")
	destLabel.SetHAlign(gtk.AlignStart)
	destLabel.AddCSSClass("heading")
	destBox.Append(destLabel)

	// Destination entry with browse button
	destEntryBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	destinationEntry := gtk.NewEntry()
	destinationEntry.SetPlaceholderText("Select destination file...")
	destinationEntry.SetEditable(false)
	destinationEntry.SetHExpand(true)
	destEntryBox.Append(destinationEntry)

	browseButton := gtk.NewButtonFromIconName("folder-open-symbolic")
	browseButton.SetTooltipText("Browse for destination")
	destEntryBox.Append(browseButton)

	destBox.Append(destEntryBox)
	headerBox.Append(destBox)

	mainBox.Append(headerBox)

	// Progress section
	progressBox := gtk.NewBox(gtk.OrientationVertical, 8)
	progressBox.SetMarginStart(18)
	progressBox.SetMarginEnd(18)
	progressBox.SetMarginTop(12)
	progressBox.SetMarginBottom(12)
	progressBox.SetVExpand(true)

	progressLabel := gtk.NewLabel("Progress")
	progressLabel.SetHAlign(gtk.AlignStart)
	progressLabel.AddCSSClass("heading")
	progressBox.Append(progressLabel)

	progressBar := gtk.NewProgressBar()
	progressBar.SetShowText(true)
	progressBar.SetText("Ready")
	progressBar.SetFraction(0.0)
	progressBox.Append(progressBar)

	statusLabel := gtk.NewLabel("")
	statusLabel.SetHAlign(gtk.AlignStart)
	statusLabel.AddCSSClass("status-label")
	statusLabel.SetVisible(false)
	progressBox.Append(statusLabel)

	mainBox.Append(progressBox)

	// Button box
	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	buttonBox.SetMarginStart(18)
	buttonBox.SetMarginEnd(18)
	buttonBox.SetMarginTop(12)
	buttonBox.SetMarginBottom(18)
	buttonBox.SetHAlign(gtk.AlignEnd)

	exportButton := gtk.NewButtonWithLabel("Export")
	exportButton.AddCSSClass("suggested-action")
	exportButton.SetSensitive(false)

	cancelButton := gtk.NewButtonWithLabel("Cancel")

	buttonBox.Append(cancelButton)
	buttonBox.Append(exportButton)
	mainBox.Append(buttonBox)

	ed := &ExportDialog{
		dialog:            dialog,
		exportType:        ExportSingle,
		exportSingleRadio: exportSingleRadio,
		exportAllRadio:    exportAllRadio,
		destinationEntry:  destinationEntry,
		browseButton:      browseButton,
		progressBar:       progressBar,
		statusLabel:       statusLabel,
		exportButton:      exportButton,
		cancelButton:      cancelButton,
		progressPercent:   0,
		progressMessage:   "Ready",
	}

	// Wire up signals
	exportSingleRadio.ConnectToggled(func() {
		ed.onExportTypeChanged()
	})

	exportAllRadio.ConnectToggled(func() {
		ed.onExportTypeChanged()
	})

	browseButton.ConnectClicked(func() {
		ed.onBrowseClicked()
	})

	exportButton.ConnectClicked(func() {
		ed.onExportClicked()
	})

	cancelButton.ConnectClicked(func() {
		ed.onCancelClicked()
	})

	return ed
}

// SetRecording sets the recording to export (for single export mode).
func (ed *ExportDialog) SetRecording(recording *db.Recording) {
	ed.recording = recording
	if recording != nil {
		ed.exportType = ExportSingle
		ed.exportSingleRadio.SetActive(true)
		// Update dialog title
		filename := filepath.Base(recording.FilePath)
		ed.dialog.SetTitle("Export: " + filename)
	}
	ed.loadPresets()
}

// SetOnExport sets the callback for when export is confirmed.
func (ed *ExportDialog) SetOnExport(callback func(recordingID string, destPath string)) {
	ed.onExport = callback
}

// SetOnCancel sets the callback for when export is cancelled.
func (ed *ExportDialog) SetOnCancel(callback func()) {
	ed.onCancel = callback
}

// Show displays the export dialog.
func (ed *ExportDialog) Show() {
	ed.dialog.Show()
}

// Hide hides the export dialog.
func (ed *ExportDialog) Hide() {
	ed.dialog.Hide()
}

// Close closes and destroys the export dialog.
func (ed *ExportDialog) Close() {
	ed.dialog.Close()
}

// UpdateProgress updates the progress bar and status.
func (ed *ExportDialog) UpdateProgress(percent int, message string) {
	ed.progressPercent = percent
	ed.progressMessage = message

	fraction := float64(percent) / 100.0
	if fraction < 0 {
		fraction = 0
	}
	if fraction > 1 {
		fraction = 1
	}

	ed.progressBar.SetFraction(fraction)
	ed.progressBar.SetText(message)

	if message != "" {
		ed.statusLabel.SetText(message)
		ed.statusLabel.SetVisible(true)
	}
}

// ResetProgress resets the progress bar to initial state.
func (ed *ExportDialog) ResetProgress() {
	ed.progressPercent = 0
	ed.progressMessage = "Ready"
	ed.progressBar.SetFraction(0.0)
	ed.progressBar.SetText("Ready")
	ed.statusLabel.SetVisible(false)
}

// SetExportingState sets the dialog to exporting state (disables controls).
func (ed *ExportDialog) SetExportingState(exporting bool) {
	ed.exportSingleRadio.SetSensitive(!exporting)
	ed.exportAllRadio.SetSensitive(!exporting)
	ed.browseButton.SetSensitive(!exporting)
	ed.exportButton.SetSensitive(!exporting && ed.destPath != "")

	if exporting {
		ed.cancelButton.SetLabel("Cancel Export")
	} else {
		ed.cancelButton.SetLabel("Cancel")
	}
}

// onExportTypeChanged handles export type radio button changes.
func (ed *ExportDialog) onExportTypeChanged() {
	if ed.exportAllRadio.Active() {
		ed.exportType = ExportAll
		ed.dialog.SetTitle("Export All Recordings")
	} else {
		ed.exportType = ExportSingle
		if ed.recording != nil {
			filename := filepath.Base(ed.recording.FilePath)
			ed.dialog.SetTitle("Export: " + filename)
		} else {
			ed.dialog.SetTitle("Export Recording")
		}
	}
}

// onBrowseClicked handles the browse button click.
func (ed *ExportDialog) onBrowseClicked() {
	fileChooser := gtk.NewFileChooserNative(
		"Select Export Destination",
		&ed.dialog.Window,
		gtk.FileChooserActionSave,
		"Export",
		"Cancel",
	)

	// Set file filter for ZIP files
	filter := gtk.NewFileFilter()
	filter.SetName("ZIP Archives")
	filter.AddPattern("*.zip")
	fileChooser.AddFilter(filter)

	// Suggest filename
	if ed.exportType == ExportSingle && ed.recording != nil {
		base := filepath.Base(ed.recording.FilePath)
		ext := filepath.Ext(base)
		suggested := base[:len(base)-len(ext)] + "_export.zip"
		fileChooser.SetCurrentName(suggested)
	} else {
		fileChooser.SetCurrentName("verbal_library_export.zip")
	}

	fileChooser.ConnectResponse(func(response int) {
		if response == int(gtk.ResponseAccept) {
			file := fileChooser.File()
			if file != nil {
				ed.destPath = file.Path()
				ed.destinationEntry.SetText(ed.destPath)
				ed.exportButton.SetSensitive(true)
			}
		}
	})

	fileChooser.Show()
}

// onExportClicked handles the export button click.
func (ed *ExportDialog) onExportClicked() {
	if ed.destPath == "" {
		return
	}

	var recordingID string
	if ed.exportType == ExportSingle && ed.recording != nil {
		recordingID = strconv.FormatInt(ed.recording.ID, 10)
	} else if ed.exportType == ExportAll {
		recordingID = "all"
	}

	if ed.onExport != nil {
		ed.SetExportingState(true)
		ed.onExport(recordingID, ed.destPath)
	}
}

// onCancelClicked handles the cancel button click.
func (ed *ExportDialog) onCancelClicked() {
	if ed.onCancel != nil {
		ed.onCancel()
	}
	ed.dialog.Close()
}

// SetPresetModel sets the model that provides preset data for the
// dropdown. The dropdown is populated when SetRecording is called.
func (ed *ExportDialog) SetPresetModel(m PresetListModel) {
	ed.presetModel = m
}

// SelectedPreset returns the currently selected preset, or nil if no
// preset is selected.
func (ed *ExportDialog) SelectedPreset() *db.Preset {
	return ed.selectedPreset
}

// SetOnPresetSelected registers a callback that fires when the user
// selects a different preset from the dropdown.
func (ed *ExportDialog) SetOnPresetSelected(cb func(p *db.Preset)) {
	ed.onPresetSelected = cb
}

// SaveCurrentAsCustomPreset validates the supplied name and saves the
// currently selected preset as a custom preset with the given name and
// description. The new preset inherits codec, container, bitrate, and
// resolution from the selected preset but IsBuiltin=false.
func (ed *ExportDialog) SaveCurrentAsCustomPreset(name, description string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("preset name must not be empty")
	}
	if strings.ContainsAny(name, "\n\r") {
		return fmt.Errorf("preset name must not contain embedded control characters")
	}

	if ed.selectedPreset == nil {
		return fmt.Errorf("no preset selected")
	}

	p := &db.Preset{
		Name:        name,
		Description: description,
		Container:   ed.selectedPreset.Container,
		VideoCodec:  ed.selectedPreset.VideoCodec,
		AudioCodec:  ed.selectedPreset.AudioCodec,
		Bitrate:     ed.selectedPreset.Bitrate,
		Width:       ed.selectedPreset.Width,
		Height:      ed.selectedPreset.Height,
		IsBuiltin:   false,
	}

	return ed.presetModel.SaveCustomPreset(context.Background(), p)
}

// PipelineConfig returns the resolved pipeline configuration for the
// currently selected preset. Returns nil if no preset is selected.
func (ed *ExportDialog) PipelineConfig() media.PipelineConfig {
	if ed.pipelineConfig != nil {
		return *ed.pipelineConfig
	}
	return media.PipelineConfig{}
}

// loadPresets fetches presets from the model and populates the dropdown.
func (ed *ExportDialog) loadPresets() {
	if ed.presetModel == nil {
		return
	}

	presets, err := ed.presetModel.ListPresets(context.Background())
	if err != nil || len(presets) == 0 {
		return
	}

	ed.presets = presets

	names := make([]string, len(presets))
	for i, p := range presets {
		names[i] = p.Name
	}

	stringList := gtk.NewStringList(names)

	if ed.presetDropdown != nil {
		ed.presetDropdown.SetModel(&stringList.ListModel)
	} else {
		ed.presetDropdown = gtk.NewDropDown(&stringList.ListModel, nil)
		ed.presetDropdown.SetHExpand(true)
	}

	ed.presetDropdown.NotifyProperty("selected", func() {
		idx := ed.presetDropdown.Selected()
		if int(idx) < len(ed.presets) {
			ed.selectedPreset = ed.presets[idx]
			if ed.onPresetSelected != nil {
				ed.onPresetSelected(ed.selectedPreset)
			}
		}
	})

	if len(presets) > 0 {
		ed.selectedPreset = presets[0]
	}

	// Insert dropdown into the dialog content area.
	content := ed.dialog.ContentArea()
	if content != nil {
		presetBox := gtk.NewBox(gtk.OrientationVertical, 8)
		presetBox.SetMarginStart(18)
		presetBox.SetMarginEnd(18)
		presetBox.SetMarginTop(0)
		presetBox.SetMarginBottom(0)

		presetLabel := gtk.NewLabel("Preset")
		presetLabel.SetHAlign(gtk.AlignStart)
		presetLabel.AddCSSClass("heading")
		presetBox.Append(presetLabel)
		presetBox.Append(ed.presetDropdown)

		content.Prepend(presetBox)
	}
}
