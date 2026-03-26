package ui

import (
	"fmt"
	"strings"

	"verbal/internal/ai"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

type TranscriptionView struct {
	container *gtk.Box
	textView  *gtk.TextView
	buffer    *gtk.TextBuffer
	status    *gtk.Label
}

func NewTranscriptionView() *TranscriptionView {
	tv := &TranscriptionView{}

	tv.container = gtk.NewBox(gtk.OrientationVertical, 8)
	tv.container.SetMarginTop(12)
	tv.container.SetMarginBottom(12)

	titleLabel := gtk.NewLabel("Transcription")
	titleLabel.AddCSSClass("title-4")
	titleLabel.SetHAlign(gtk.AlignStart)
	tv.container.Append(titleLabel)

	tv.status = gtk.NewLabel("No transcription yet")
	tv.status.AddCSSClass("dim-label")
	tv.status.SetHAlign(gtk.AlignStart)
	tv.container.Append(tv.status)

	scrolledWindow := gtk.NewScrolledWindow()
	scrolledWindow.SetMinContentHeight(150)
	scrolledWindow.SetHExpand(true)
	scrolledWindow.SetVExpand(true)

	tv.buffer = gtk.NewTextBuffer(nil)
	tv.textView = gtk.NewTextViewWithBuffer(tv.buffer)
	tv.textView.SetEditable(false)
	tv.textView.SetWrapMode(gtk.WrapWordChar)
	tv.textView.AddCSSClass("transcription-text")
	tv.textView.SetMarginStart(8)
	tv.textView.SetMarginEnd(8)
	tv.textView.SetMarginTop(8)
	tv.textView.SetMarginBottom(8)

	scrolledWindow.SetChild(tv.textView)
	tv.container.Append(scrolledWindow)

	tv.container.SetVisible(false)

	return tv
}

func (tv *TranscriptionView) Widget() *gtk.Box {
	return tv.container
}

func (tv *TranscriptionView) SetResult(result *ai.TranscriptionResult) {
	tv.container.SetVisible(true)
	tv.status.SetText(fmt.Sprintf("Language: %s | Duration: %.1fs | Provider: %s",
		result.Language, result.Duration, result.Provider))

	tv.buffer.SetText(result.Text)

	if len(result.Words) > 0 {
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("Words (%d):\n", len(result.Words)))
		for _, w := range result.Words {
			sb.WriteString(fmt.Sprintf("  [%.2f-%.2f] %s\n", w.Start, w.End, w.Word))
		}
		tv.buffer.SetText(sb.String())
	}
}

func (tv *TranscriptionView) SetStatus(status string) {
	tv.container.SetVisible(true)
	tv.status.SetText(status)
	tv.buffer.SetText("")
}

func (tv *TranscriptionView) SetError(err error) {
	tv.container.SetVisible(true)
	tv.status.SetText("Error")
	tv.buffer.SetText(err.Error())
	tv.textView.AddCSSClass("error")
}

func (tv *TranscriptionView) Clear() {
	tv.container.SetVisible(false)
	tv.status.SetText("No transcription yet")
	tv.buffer.SetText("")
	tv.textView.RemoveCSSClass("error")
}

func (tv *TranscriptionView) Show() {
	tv.container.SetVisible(true)
}
