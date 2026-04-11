package ui

import (
	"path/filepath"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/lifecycle"
)

// ImportDialog provides a dialog for importing recordings.
type ImportDialog struct {
	dialog *gtk.Dialog

	// Import configuration
	archivePath       string
	duplicateHandling lifecycle.DuplicateHandling

	// UI Components
	fileEntry    *gtk.Entry
	browseButton *gtk.Button
	skipRadio    *gtk.CheckButton
	replaceRadio *gtk.CheckButton
	renameRadio  *gtk.CheckButton
	progressBar  *gtk.ProgressBar
	statusLabel  *gtk.Label
	resultBox    *gtk.Box
	resultLabel  *gtk.Label
	importButton *gtk.Button
	cancelButton *gtk.Button

	// State
	progressPercent int
	progressMessage string
	result          *lifecycle.ImportResult

	// Callbacks
	onImport func(archivePath string, handling lifecycle.DuplicateHandling)
	onCancel func()
}

// NewImportDialog creates a new import dialog.
func NewImportDialog(parent *gtk.Window) *ImportDialog {
	dialog := gtk.NewDialog()
	dialog.SetTitle("Import Recordings")
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

	// Header section
	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(18)
	headerBox.SetMarginEnd(18)
	headerBox.SetMarginTop(18)
	headerBox.SetMarginBottom(12)

	// Title
	titleLabel := gtk.NewLabel("Import Recordings")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHAlign(gtk.AlignStart)
	headerBox.Append(titleLabel)

	// File selection section
	fileBox := gtk.NewBox(gtk.OrientationVertical, 8)
	fileLabel := gtk.NewLabel("Select Archive")
	fileLabel.SetHAlign(gtk.AlignStart)
	fileLabel.AddCSSClass("heading")
	fileBox.Append(fileLabel)

	// File entry with browse button
	fileEntryBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	fileEntry := gtk.NewEntry()
	fileEntry.SetPlaceholderText("Select a ZIP archive to import...")
	fileEntry.SetEditable(false)
	fileEntry.SetHExpand(true)
	fileEntryBox.Append(fileEntry)

	browseButton := gtk.NewButtonFromIconName("folder-open-symbolic")
	browseButton.SetTooltipText("Browse for archive file")
	fileEntryBox.Append(browseButton)

	fileBox.Append(fileEntryBox)
	headerBox.Append(fileBox)

	// Separator
	separator := gtk.NewSeparator(gtk.OrientationHorizontal)
	headerBox.Append(separator)

	// Duplicate handling section
	dupBox := gtk.NewBox(gtk.OrientationVertical, 8)
	dupLabel := gtk.NewLabel("Duplicate Handling")
	dupLabel.SetHAlign(gtk.AlignStart)
	dupLabel.AddCSSClass("heading")
	dupBox.Append(dupLabel)

	dupDescLabel := gtk.NewLabel("What to do when a recording already exists:")
	dupDescLabel.SetHAlign(gtk.AlignStart)
	dupDescLabel.AddCSSClass("dim-label")
	dupBox.Append(dupDescLabel)

	// Skip radio
	skipRadio := gtk.NewCheckButtonWithLabel("Skip - don't import duplicates")
	skipRadio.SetActive(true)
	dupBox.Append(skipRadio)

	// Replace radio
	replaceRadio := gtk.NewCheckButtonWithLabel("Replace - overwrite existing recordings")
	replaceRadio.SetGroup(skipRadio)
	dupBox.Append(replaceRadio)

	// Rename radio
	renameRadio := gtk.NewCheckButtonWithLabel("Rename - import with a new ID")
	renameRadio.SetGroup(skipRadio)
	dupBox.Append(renameRadio)

	headerBox.Append(dupBox)

	mainBox.Append(headerBox)

	// Progress section
	progressBox := gtk.NewBox(gtk.OrientationVertical, 8)
	progressBox.SetMarginStart(18)
	progressBox.SetMarginEnd(18)
	progressBox.SetMarginTop(12)
	progressBox.SetMarginBottom(12)

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

	// Result section (initially hidden)
	resultBox := gtk.NewBox(gtk.OrientationVertical, 8)
	resultBox.SetMarginStart(18)
	resultBox.SetMarginEnd(18)
	resultBox.SetMarginTop(12)
	resultBox.SetMarginBottom(12)
	resultBox.SetVisible(false)

	resultLabel := gtk.NewLabel("")
	resultLabel.SetHAlign(gtk.AlignStart)
	resultLabel.AddCSSClass("success-label")
	resultBox.Append(resultLabel)

	mainBox.Append(resultBox)

	// Button box
	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	buttonBox.SetMarginStart(18)
	buttonBox.SetMarginEnd(18)
	buttonBox.SetMarginTop(12)
	buttonBox.SetMarginBottom(18)
	buttonBox.SetHAlign(gtk.AlignEnd)

	importButton := gtk.NewButtonWithLabel("Import")
	importButton.AddCSSClass("suggested-action")
	importButton.SetSensitive(false)

	cancelButton := gtk.NewButtonWithLabel("Cancel")

	buttonBox.Append(cancelButton)
	buttonBox.Append(importButton)
	mainBox.Append(buttonBox)

	id := &ImportDialog{
		dialog:            dialog,
		duplicateHandling: lifecycle.DuplicateSkip,
		fileEntry:         fileEntry,
		browseButton:      browseButton,
		skipRadio:         skipRadio,
		replaceRadio:      replaceRadio,
		renameRadio:       renameRadio,
		progressBar:       progressBar,
		statusLabel:       statusLabel,
		resultBox:         resultBox,
		resultLabel:       resultLabel,
		importButton:      importButton,
		cancelButton:      cancelButton,
		progressPercent:   0,
		progressMessage:   "Ready",
	}

	// Wire up signals
	skipRadio.ConnectToggled(func() {
		id.onDuplicateHandlingChanged()
	})

	replaceRadio.ConnectToggled(func() {
		id.onDuplicateHandlingChanged()
	})

	renameRadio.ConnectToggled(func() {
		id.onDuplicateHandlingChanged()
	})

	browseButton.ConnectClicked(func() {
		id.onBrowseClicked()
	})

	importButton.ConnectClicked(func() {
		id.onImportClicked()
	})

	cancelButton.ConnectClicked(func() {
		id.onCancelClicked()
	})

	return id
}

// SetOnImport sets the callback for when import is confirmed.
func (id *ImportDialog) SetOnImport(callback func(archivePath string, handling lifecycle.DuplicateHandling)) {
	id.onImport = callback
}

// SetOnCancel sets the callback for when import is cancelled.
func (id *ImportDialog) SetOnCancel(callback func()) {
	id.onCancel = callback
}

// Show displays the import dialog.
func (id *ImportDialog) Show() {
	id.dialog.Show()
}

// Hide hides the import dialog.
func (id *ImportDialog) Hide() {
	id.dialog.Hide()
}

// Close closes and destroys the import dialog.
func (id *ImportDialog) Close() {
	id.dialog.Close()
}

// UpdateProgress updates the progress bar and status.
func (id *ImportDialog) UpdateProgress(percent int, message string) {
	id.progressPercent = percent
	id.progressMessage = message

	fraction := float64(percent) / 100.0
	if fraction < 0 {
		fraction = 0
	}
	if fraction > 1 {
		fraction = 1
	}

	id.progressBar.SetFraction(fraction)
	id.progressBar.SetText(message)

	if message != "" {
		id.statusLabel.SetText(message)
		id.statusLabel.SetVisible(true)
	}
}

// SetResult displays the import result.
func (id *ImportDialog) SetResult(result *lifecycle.ImportResult) {
	id.result = result

	if result == nil {
		id.resultBox.SetVisible(false)
		return
	}

	// Build result message
	var message string
	if len(result.Errors) > 0 {
		message = "Import completed with errors:\n"
		message += "Imported: %d, Skipped: %d, Replaced: %d\n"
		message += "Errors: %d"
		id.resultLabel.SetText(message)
		id.resultLabel.AddCSSClass("error-label")
		id.resultLabel.RemoveCSSClass("success-label")
	} else {
		message = "Import completed successfully!\n"
		message += "Imported: %d, Skipped: %d, Replaced: %d"
		id.resultLabel.SetText(message)
		id.resultLabel.AddCSSClass("success-label")
		id.resultLabel.RemoveCSSClass("error-label")
	}

	id.resultBox.SetVisible(true)
}

// SetImportingState sets the dialog to importing state (disables controls).
func (id *ImportDialog) SetImportingState(importing bool) {
	id.browseButton.SetSensitive(!importing)
	id.skipRadio.SetSensitive(!importing)
	id.replaceRadio.SetSensitive(!importing)
	id.renameRadio.SetSensitive(!importing)
	id.importButton.SetSensitive(!importing && id.archivePath != "")

	if importing {
		id.cancelButton.SetLabel("Cancel Import")
	} else {
		id.cancelButton.SetLabel("Cancel")
	}
}

// onDuplicateHandlingChanged handles duplicate handling radio button changes.
func (id *ImportDialog) onDuplicateHandlingChanged() {
	if id.replaceRadio.Active() {
		id.duplicateHandling = lifecycle.DuplicateReplace
	} else if id.renameRadio.Active() {
		id.duplicateHandling = lifecycle.DuplicateRename
	} else {
		id.duplicateHandling = lifecycle.DuplicateSkip
	}
}

// onBrowseClicked handles the browse button click.
func (id *ImportDialog) onBrowseClicked() {
	fileChooser := gtk.NewFileChooserNative(
		"Select Archive to Import",
		&id.dialog.Window,
		gtk.FileChooserActionOpen,
		"Import",
		"Cancel",
	)

	// Set file filter for ZIP files
	filter := gtk.NewFileFilter()
	filter.SetName("ZIP Archives")
	filter.AddPattern("*.zip")
	fileChooser.AddFilter(filter)

	fileChooser.ConnectResponse(func(response int) {
		if response == int(gtk.ResponseAccept) {
			file := fileChooser.File()
			if file != nil {
				id.archivePath = file.Path()
				id.fileEntry.SetText(filepath.Base(id.archivePath))
				id.importButton.SetSensitive(true)
			}
		}
	})

	fileChooser.Show()
}

// onImportClicked handles the import button click.
func (id *ImportDialog) onImportClicked() {
	if id.archivePath == "" {
		return
	}

	if id.onImport != nil {
		id.SetImportingState(true)
		id.onImport(id.archivePath, id.duplicateHandling)
	}
}

// onCancelClicked handles the cancel button click.
func (id *ImportDialog) onCancelClicked() {
	if id.onCancel != nil {
		id.onCancel()
	}
	id.dialog.Close()
}
