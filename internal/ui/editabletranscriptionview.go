package ui

import (
	"fmt"
	"strings"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/ai"
)

// EditableTranscriptionView provides a GTK widget for viewing and editing
// transcription results with word-level selection support for segment export.
type EditableTranscriptionView struct {
	box            *gtk.Box
	titleLabel     *gtk.Label
	textView       *gtk.TextView
	buffer         *gtk.TextBuffer
	wordContainer  *WordContainer
	stack          *gtk.Stack
	selectButton   *gtk.Button
	exportButton   *gtk.Button
	clearSelButton *gtk.Button

	words             []ai.Word
	onTextChanged     func(newText string)
	onExportRequested func(segments []Segment)
}

// Segment represents a selected range of words for export.
type Segment struct {
	StartIndex int
	EndIndex   int
	StartTime  float64
	EndTime    float64
	Text       string
}

// NewEditableTranscriptionView creates a new editable transcription view.
func NewEditableTranscriptionView() *EditableTranscriptionView {
	box := gtk.NewBox(gtk.OrientationVertical, 8)
	box.AddCSSClass("transcription-view")
	box.SetVisible(false)

	titleLabel := gtk.NewLabel("Transcription Result")
	titleLabel.AddCSSClass("title-label")
	titleLabel.SetWrap(true)
	titleLabel.SetSelectable(true)
	titleLabel.SetMaxWidthChars(72)
	titleLabel.SetXAlign(0)

	buffer := gtk.NewTextBuffer(nil)
	textView := gtk.NewTextViewWithBuffer(buffer)
	textView.SetEditable(true)
	textView.SetWrapMode(gtk.WrapWord)
	textView.SetSizeRequest(-1, 200)

	scrolled := gtk.NewScrolledWindow()
	scrolled.SetChild(textView)
	scrolled.SetVExpand(true)

	wordContainer := NewWordContainer(nil)

	stack := gtk.NewStack()
	stack.AddNamed(scrolled, "text")

	wordScrolled := gtk.NewScrolledWindow()
	wordScrolled.SetChild(wordContainer.Widget())
	wordScrolled.SetVExpand(true)
	wordScrolled.SetSizeRequest(-1, 160)
	stack.AddNamed(wordScrolled, "words")
	stack.SetVisibleChildName("text")

	toolbar := gtk.NewBox(gtk.OrientationHorizontal, 4)
	toolbar.AddCSSClass("transcription-toolbar")

	selectButton := gtk.NewButtonWithLabel("Word timings")
	selectButton.SetTooltipText("Show word timings and select ranges for export")
	selectButton.AddCSSClass("flat")

	clearSelButton := gtk.NewButtonFromIconName("edit-clear-symbolic")
	clearSelButton.SetTooltipText("Clear selection")
	clearSelButton.AddCSSClass("flat")
	clearSelButton.SetVisible(false)

	exportButton := gtk.NewButtonFromIconName("media-export-symbolic")
	exportButton.SetTooltipText("Export selected segments")
	exportButton.AddCSSClass("flat")
	exportButton.SetVisible(false)

	toolbar.Append(selectButton)
	toolbar.Append(clearSelButton)
	toolbar.Append(exportButton)

	box.Append(titleLabel)
	box.Append(toolbar)
	box.Append(stack)

	view := &EditableTranscriptionView{
		box:            box,
		titleLabel:     titleLabel,
		textView:       textView,
		buffer:         buffer,
		wordContainer:  wordContainer,
		stack:          stack,
		selectButton:   selectButton,
		exportButton:   exportButton,
		clearSelButton: clearSelButton,
		words:          nil,
	}

	selectButton.ConnectClicked(func() {
		if view.stack.VisibleChildName() == "text" {
			view.stack.SetVisibleChildName("words")
			selectButton.AddCSSClass("suggested-action")
			view.wordContainer.SetSelectionMode(true)
			view.clearSelButton.SetVisible(true)
			view.exportButton.SetVisible(true)
		} else {
			view.stack.SetVisibleChildName("text")
			selectButton.RemoveCSSClass("suggested-action")
			view.wordContainer.SetSelectionMode(false)
			view.clearSelButton.SetVisible(false)
			view.exportButton.SetVisible(false)
		}
	})

	clearSelButton.ConnectClicked(func() {
		view.wordContainer.ClearSelection()
	})

	exportButton.ConnectClicked(func() {
		if view.wordContainer.HasSelection() {
			start, end := view.wordContainer.GetSelection()
			segments := view.buildSegments(start, end)
			if view.onExportRequested != nil {
				view.onExportRequested(segments)
			}
		}
	})

	buffer.ConnectChanged(func() {
		if view.onTextChanged != nil {
			startIter, endIter := buffer.Bounds()
			text := startIter.Text(endIter)
			view.onTextChanged(text)
		}
	})

	return view
}

// Widget returns the root GTK box widget.
func (v *EditableTranscriptionView) Widget() *gtk.Box {
	return v.box
}

// SetResult displays the transcription result in the view.
func (v *EditableTranscriptionView) SetResult(result *ai.TranscriptionResult) {
	v.box.SetVisible(true)
	v.titleLabel.SetText("Transcription Complete")
	v.buffer.SetText(result.Text)
	v.words = result.Words

	wordData := make([]WordData, len(result.Words))
	for i, w := range result.Words {
		wordData[i] = WordData{
			Text:      w.Text,
			StartTime: w.Start,
			EndTime:   w.End,
			Index:     i,
		}
	}
	v.wordContainer.SetWords(wordData)
}

// SetStatus updates the title with a status message.
func (v *EditableTranscriptionView) SetStatus(status string) {
	v.box.SetVisible(true)
	v.titleLabel.SetText(status)
}

// SetError displays an error message.
func (v *EditableTranscriptionView) SetError(err error) {
	v.box.SetVisible(true)
	v.titleLabel.SetText("Transcription Error")
	v.buffer.SetText(fmt.Sprintf("%v", err))
	v.stack.SetVisibleChildName("text")
}

// Show makes the view visible.
func (v *EditableTranscriptionView) Show() {
	v.box.SetVisible(true)
}

// Hide hides the view.
func (v *EditableTranscriptionView) Hide() {
	v.box.SetVisible(false)
}

// SetTextChangedHandler sets the callback for text changes.
func (v *EditableTranscriptionView) SetTextChangedHandler(handler func(newText string)) {
	v.onTextChanged = handler
}

// SetExportRequestedHandler sets the callback for export requests.
func (v *EditableTranscriptionView) SetExportRequestedHandler(handler func(segments []Segment)) {
	v.onExportRequested = handler
}

// GetText returns the current text content.
func (v *EditableTranscriptionView) GetText() string {
	startIter, endIter := v.buffer.Bounds()
	return startIter.Text(endIter)
}

// GetWords returns the word-level transcription data.
func (v *EditableTranscriptionView) GetWords() []ai.Word {
	return v.words
}

// GetWordContainer returns the populated word timing container used by this view.
func (v *EditableTranscriptionView) GetWordContainer() *WordContainer {
	return v.wordContainer
}

// GetSelectedSegments returns the currently selected word segments.
func (v *EditableTranscriptionView) GetSelectedSegments() []Segment {
	if !v.wordContainer.HasSelection() {
		return nil
	}
	start, end := v.wordContainer.GetSelection()
	return v.buildSegments(start, end)
}

func (v *EditableTranscriptionView) buildSegments(start, end int) []Segment {
	if start < 0 || end >= len(v.words) || start > end {
		return nil
	}

	var textParts []string
	for i := start; i <= end && i < len(v.words); i++ {
		textParts = append(textParts, v.words[i].Text)
	}

	return []Segment{
		{
			StartIndex: start,
			EndIndex:   end,
			StartTime:  v.words[start].Start,
			EndTime:    v.words[end].End,
			Text:       strings.Join(textParts, " "),
		},
	}
}
