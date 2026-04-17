package ui

import (
	"fmt"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/ai"
)

// TranscriptionView provides a GTK widget for displaying transcription results.
// It includes a label for status updates and a scrollable text view for the transcription text.
type TranscriptionView struct {
	box    *gtk.Box
	label  *gtk.Label
	text   *gtk.TextView
	buffer *gtk.TextBuffer
}

// NewTranscriptionView creates a new transcription view widget.
// The widget is initially hidden and should be shown using Show() when needed.
func NewTranscriptionView() *TranscriptionView {
	box := gtk.NewBox(gtk.OrientationVertical, 8)
	box.AddCSSClass("transcription-view")
	box.SetVisible(false)

	label := gtk.NewLabel("Transcription Result")
	label.AddCSSClass("title-label")
	label.SetWrap(true)
	label.SetSelectable(true)
	label.SetMaxWidthChars(72)
	label.SetXAlign(0)

	buffer := gtk.NewTextBuffer(nil)
	text := gtk.NewTextViewWithBuffer(buffer)
	text.SetEditable(false)
	text.SetWrapMode(gtk.WrapWord)
	text.SetSizeRequest(-1, 200)

	scrolled := gtk.NewScrolledWindow()
	scrolled.SetChild(text)
	scrolled.SetVExpand(true)

	box.Append(label)
	box.Append(scrolled)

	return &TranscriptionView{
		box:    box,
		label:  label,
		text:   text,
		buffer: buffer,
	}
}

// Widget returns the root GTK box widget for adding to a container.
func (v *TranscriptionView) Widget() *gtk.Box {
	return v.box
}

// SetResult displays the transcription result in the view.
// This makes the widget visible and updates the label and text content.
func (v *TranscriptionView) SetResult(result *ai.TranscriptionResult) {
	v.box.SetVisible(true)
	v.label.SetText("Transcription Complete")
	v.buffer.SetText(result.Text)
}

// SetStatus updates the label with a status message.
// Use this to show progress updates during transcription.
func (v *TranscriptionView) SetStatus(status string) {
	v.box.SetVisible(true)
	v.label.SetText(status)
}

// SetError displays an error message in the view.
// The error will be shown in the label area.
func (v *TranscriptionView) SetError(err error) {
	v.box.SetVisible(true)
	v.label.SetText("Transcription Error")
	v.buffer.SetText(fmt.Sprintf("%v", err))
}

// Show makes the transcription view visible.
func (v *TranscriptionView) Show() {
	v.box.SetVisible(true)
}

// Hide hides the transcription view.
func (v *TranscriptionView) Hide() {
	v.box.SetVisible(false)
}
