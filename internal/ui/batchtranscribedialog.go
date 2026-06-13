package ui

import (
	"fmt"
	"strings"

	"github.com/diamondburned/gotk4/pkg/core/glib"
	"github.com/diamondburned/gotk4/pkg/gio/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// BatchTranscribeActionName is the GAction name registered for the batch
// transcribe menu item.
const BatchTranscribeActionName = "batch-transcribe"

// BatchTranscribeDialog provides a dialog for selecting multiple media files
// to enqueue for batch transcription. It follows the ImportDialog pattern:
// modal gtk.Dialog with file picker, multi-path entry, and embedded
// validation against newline characters (GStreamer path safety).
type BatchTranscribeDialog struct {
	dialog *gtk.Dialog

	// paths is the list of validated file paths to enqueue.
	paths []string

	// UI components
	fileEntry    *gtk.Entry
	browseButton *gtk.Button
	pathList     *gtk.ListBox
	addButton    *gtk.Button
	clearButton  *gtk.Button
	enqueueButton *gtk.Button
	cancelButton *gtk.Button
	statusLabel  *gtk.Label

	// Callbacks
	onEnqueue func(paths []string)
	onCancel  func()
}

// NewBatchTranscribeDialog creates a new batch transcribe dialog.
func NewBatchTranscribeDialog(parent *gtk.Window) *BatchTranscribeDialog {
	dialog := gtk.NewDialog()
	dialog.SetTitle("Batch Transcribe")
	dialog.SetTransientFor(parent)
	dialog.SetModal(true)
	dialog.SetDefaultSize(500, 400)
	dialog.SetResizable(false)

	content := dialog.ContentArea()
	content.SetSpacing(0)

	mainBox := gtk.NewBox(gtk.OrientationVertical, 0)
	mainBox.SetVExpand(true)
	content.Append(mainBox)

	// Header section
	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(18)
	headerBox.SetMarginEnd(18)
	headerBox.SetMarginTop(18)
	headerBox.SetMarginBottom(12)

	titleLabel := gtk.NewLabel("Select Files to Transcribe")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHAlign(gtk.AlignStart)
	headerBox.Append(titleLabel)

	descLabel := gtk.NewLabel("Add media files to the batch transcription queue.")
	descLabel.SetHAlign(gtk.AlignStart)
	descLabel.AddCSSClass("dim-label")
	headerBox.Append(descLabel)

	// File entry with browse button
	fileEntryBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	fileEntry := gtk.NewEntry()
	fileEntry.SetPlaceholderText("Enter file path or browse...")
	fileEntry.SetHExpand(true)
	fileEntryBox.Append(fileEntry)

	browseButton := gtk.NewButtonFromIconName("folder-open-symbolic")
	browseButton.SetTooltipText("Browse for media files")
	fileEntryBox.Append(browseButton)

	addButton := gtk.NewButtonWithLabel("Add")
	addButton.AddCSSClass("suggested-action")
	fileEntryBox.Append(addButton)

	headerBox.Append(fileEntryBox)
	mainBox.Append(headerBox)

	// Path list
	listScrolled := gtk.NewScrolledWindow()
	listScrolled.SetPolicy(gtk.PolicyNever, gtk.PolicyAutomatic)
	listScrolled.SetVExpand(true)
	listScrolled.SetMinContentHeight(150)
	listScrolled.SetMarginStart(18)
	listScrolled.SetMarginEnd(18)

	pathList := gtk.NewListBox()
	pathList.AddCSSClass("library-list")
	listScrolled.SetChild(pathList)
	mainBox.Append(listScrolled)

	// Status label
	statusLabel := gtk.NewLabel("")
	statusLabel.SetHAlign(gtk.AlignStart)
	statusLabel.SetMarginStart(18)
	statusLabel.SetMarginEnd(18)
	statusLabel.SetMarginTop(4)
	statusLabel.AddCSSClass("dim-label")
	statusLabel.SetVisible(false)
	mainBox.Append(statusLabel)

	// Button box
	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 12)
	buttonBox.SetMarginStart(18)
	buttonBox.SetMarginEnd(18)
	buttonBox.SetMarginTop(12)
	buttonBox.SetMarginBottom(18)
	buttonBox.SetHAlign(gtk.AlignEnd)

	clearButton := gtk.NewButtonWithLabel("Clear All")
	clearButton.AddCSSClass("destructive-action")
	clearButton.SetSensitive(false)

	cancelButton := gtk.NewButtonWithLabel("Cancel")
	enqueueButton := gtk.NewButtonWithLabel("Enqueue")
	enqueueButton.AddCSSClass("suggested-action")
	enqueueButton.SetSensitive(false)

	buttonBox.Append(clearButton)
	buttonBox.Append(cancelButton)
	buttonBox.Append(enqueueButton)
	mainBox.Append(buttonBox)

	d := &BatchTranscribeDialog{
		dialog:         dialog,
		paths:          nil,
		fileEntry:      fileEntry,
		browseButton:   browseButton,
		pathList:       pathList,
		addButton:      addButton,
		clearButton:    clearButton,
		enqueueButton:  enqueueButton,
		cancelButton:   cancelButton,
		statusLabel:    statusLabel,
	}

	// Wire signals
	addButton.ConnectClicked(func() {
		text := fileEntry.Text()
		if text != "" {
			if err := d.AddPath(text); err != nil {
				d.showStatus(err.Error())
			} else {
				fileEntry.SetText("")
				d.showStatus("")
			}
		}
	})

	browseButton.ConnectClicked(func() {
		d.onBrowseClicked()
	})

	clearButton.ConnectClicked(func() {
		d.paths = nil
		d.refreshPathList()
		d.updateButtons()
	})

	enqueueButton.ConnectClicked(func() {
		if d.onEnqueue != nil && len(d.paths) > 0 {
			d.onEnqueue(d.paths)
		}
		d.dialog.Close()
	})

	cancelButton.ConnectClicked(func() {
		if d.onCancel != nil {
			d.onCancel()
		}
		d.dialog.Close()
	})

	return d
}

// SetPaths sets the list of file paths, replacing any existing paths.
func (d *BatchTranscribeDialog) SetPaths(paths []string) {
	d.paths = make([]string, len(paths))
	copy(d.paths, paths)
	d.refreshPathList()
	d.updateButtons()
}

// GetPaths returns the current list of validated file paths.
func (d *BatchTranscribeDialog) GetPaths() ([]string, error) {
	result := make([]string, len(d.paths))
	copy(result, d.paths)
	return result, nil
}

// AddPath adds a single file path after validation. Rejects paths containing
// embedded newline or carriage return characters (GStreamer path safety).
func (d *BatchTranscribeDialog) AddPath(path string) error {
	if strings.ContainsAny(path, "\n\r") {
		return fmt.Errorf("path contains invalid characters (newline/carriage return)")
	}
	d.paths = append(d.paths, path)
	d.refreshPathList()
	d.updateButtons()
	return nil
}

// SetOnEnqueue sets the callback invoked when the user confirms the batch.
func (d *BatchTranscribeDialog) SetOnEnqueue(cb func(paths []string)) {
	d.onEnqueue = cb
}

// SetOnCancel sets the callback invoked when the user cancels the dialog.
func (d *BatchTranscribeDialog) SetOnCancel(cb func()) {
	d.onCancel = cb
}

// Show displays the dialog.
func (d *BatchTranscribeDialog) Show() {
	d.dialog.Show()
}

// Close closes and destroys the dialog.
func (d *BatchTranscribeDialog) Close() {
	d.dialog.Close()
}

// onBrowseClicked opens a file chooser for selecting media files.
func (d *BatchTranscribeDialog) onBrowseClicked() {
	fileChooser := gtk.NewFileChooserNative(
		"Select Media Files",
		&d.dialog.Window,
		gtk.FileChooserActionOpen,
		"Select",
		"Cancel",
	)
	fileChooser.SetSelectMultiple(true)

	filter := gtk.NewFileFilter()
	filter.SetName("Media Files")
	filter.AddPattern("*.mp4")
	filter.AddPattern("*.mkv")
	filter.AddPattern("*.webm")
	filter.AddPattern("*.avi")
	filter.AddPattern("*.mov")
	filter.AddPattern("*.wav")
	filter.AddPattern("*.mp3")
	filter.AddPattern("*.ogg")
	filter.AddPattern("*.flac")
	fileChooser.AddFilter(filter)

	allFilter := gtk.NewFileFilter()
	allFilter.SetName("All Files")
	allFilter.AddPattern("*")
	fileChooser.AddFilter(allFilter)

	fileChooser.ConnectResponse(func(response int) {
		if response == int(gtk.ResponseAccept) {
			files := fileChooser.Files()
			for i := uint(0); i < files.NItems(); i++ {
				obj := files.Item(i)
				if casted := glib.CastObject(obj); casted != nil {
					if gfile, ok := casted.(*gio.File); ok {
						if err := d.AddPath(gfile.Path()); err != nil {
							d.showStatus(err.Error())
						}
					}
				}
			}
			d.showStatus("")
		}
	})

	fileChooser.Show()
}

// refreshPathList rebuilds the path list UI from d.paths.
func (d *BatchTranscribeDialog) refreshPathList() {
	d.pathList.RemoveAll()
	for _, p := range d.paths {
		row := gtk.NewListBoxRow()
		rowBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
		rowBox.SetMarginStart(8)
		rowBox.SetMarginEnd(8)
		rowBox.SetMarginTop(4)
		rowBox.SetMarginBottom(4)

		label := gtk.NewLabel(p)
		label.SetHAlign(gtk.AlignStart)
		label.SetHExpand(true)
		label.SetEllipsize(3) // PANGO_ELLIPSIZE_END
		rowBox.Append(label)

		row.SetChild(rowBox)
		d.pathList.Append(row)
	}
}

// updateButtons enables/disables buttons based on current state.
func (d *BatchTranscribeDialog) updateButtons() {
	hasPaths := len(d.paths) > 0
	d.clearButton.SetSensitive(hasPaths)
	d.enqueueButton.SetSensitive(hasPaths)
}

// showStatus displays a status message.
func (d *BatchTranscribeDialog) showStatus(msg string) {
	if msg == "" {
		d.statusLabel.SetVisible(false)
	} else {
		d.statusLabel.SetText(msg)
		d.statusLabel.SetVisible(true)
	}
}
