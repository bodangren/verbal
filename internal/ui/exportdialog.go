package ui

import (
	"path/filepath"
	"strconv"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/db"
)

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
