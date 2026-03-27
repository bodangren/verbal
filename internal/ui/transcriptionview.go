package ui

import (
	"fmt"
	"verbal/internal/ai"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

type TranscriptionView struct {
	box    *gtk.Box
	label  *gtk.Label
	text   *gtk.TextView
	buffer *gtk.TextBuffer
}

func NewTranscriptionView() *TranscriptionView {
	box := gtk.NewBox(gtk.OrientationVertical, 8)
	box.AddCSSClass("transcription-view")
	box.SetVisible(false)

	label := gtk.NewLabel("Transcription Result")
	label.AddCSSClass("title-label")

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

func (v *TranscriptionView) Widget() *gtk.Box {
	return v.box
}

func (v *TranscriptionView) SetResult(result *ai.TranscriptionResult) {
	v.box.SetVisible(true)
	v.label.SetText("Transcription Complete")
	v.buffer.SetText(result.Text)
}

func (v *TranscriptionView) SetStatus(status string) {
	v.box.SetVisible(true)
	v.label.SetText(status)
}

func (v *TranscriptionView) SetError(err error) {
	v.box.SetVisible(true)
	v.label.SetText(fmt.Sprintf("Error: %v", err))
}

func (v *TranscriptionView) Show() {
	v.box.SetVisible(true)
}

func (v *TranscriptionView) Hide() {
	v.box.SetVisible(false)
}
