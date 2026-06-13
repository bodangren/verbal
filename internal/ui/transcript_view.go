package ui

import (
	"sync"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/ai"
)

// TranscriptView is a read-only widget that displays a list of
// transcribed words in a flowing layout. Each word is rendered as a
// clickable label. Clicking a word invokes the callback registered
// via SetOnWordClicked with the word's index in the most-recent
// SetWords list (the spec's OnWordClicked(wordIndex) contract).
//
// The widget is consumed by ui.PlaybackScreen (Phase 5) and receives
// highlight updates from the sync controller (Phase 4) via the same
// word-index channel.
type TranscriptView struct {
	mu            sync.RWMutex
	words         []ai.Word
	onWordClicked func(wordIndex int)

	box     *gtk.Box
	flowBox *gtk.FlowBox
	labels  []*gtk.Label
}

// NewTranscriptView creates an empty transcript view with a GTK widget tree.
func NewTranscriptView() *TranscriptView {
	box := gtk.NewBox(gtk.OrientationVertical, 0)
	box.AddCSSClass("transcript-view")

	flowBox := gtk.NewFlowBox()
	flowBox.SetSelectionMode(gtk.SelectionNone)
	flowBox.SetRowSpacing(4)
	flowBox.SetColumnSpacing(2)
	flowBox.SetHomogeneous(false)
	flowBox.AddCSSClass("transcript-word-container")

	box.Append(flowBox)

	return &TranscriptView{
		words:   []ai.Word{},
		labels:  []*gtk.Label{},
		box:     box,
		flowBox: flowBox,
	}
}

// Widget returns the root GTK widget for embedding in containers.
func (v *TranscriptView) Widget() *gtk.Widget {
	return &v.box.Widget
}

// SetWords replaces the displayed words with the given list. Calling
// with a nil or empty slice clears the view.
func (v *TranscriptView) SetWords(words []ai.Word) {
	v.mu.Lock()
	defer v.mu.Unlock()

	// Clear existing labels from the flow box.
	for _, lbl := range v.labels {
		v.flowBox.Remove(lbl)
	}
	v.labels = v.labels[:0]

	if words == nil {
		v.words = []ai.Word{}
		return
	}

	v.words = make([]ai.Word, len(words))
	copy(v.words, words)

	for i, w := range v.words {
		label := gtk.NewLabel(w.Text + " ")
		label.AddCSSClass("word-label")

		clickGesture := gtk.NewGestureClick()
		clickGesture.SetButton(1)
		wordIndex := i
		clickGesture.ConnectReleased(func(nPress int, x, y float64) {
			v.emitClick(wordIndex)
		})
		label.AddController(clickGesture)

		v.labels = append(v.labels, label)
		v.flowBox.Append(label)
	}
}

// WordCount returns the number of words currently displayed.
func (v *TranscriptView) WordCount() int {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return len(v.words)
}

// WordAt returns the word at the given index. Returns (ai.Word{},
// false) if the index is out of range.
func (v *TranscriptView) WordAt(index int) (ai.Word, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	if index < 0 || index >= len(v.words) {
		return ai.Word{}, false
	}
	return v.words[index], true
}

// SetOnWordClicked registers a callback invoked when a word is
// clicked. The callback receives the index of the clicked word in
// the most-recent SetWords list. Passing nil clears the callback.
func (v *TranscriptView) SetOnWordClicked(callback func(wordIndex int)) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.onWordClicked = callback
}

// emitClick is the package-private dispatch entry point used by the
// gtk.GestureClick handler attached to each word label and by
// headless tests. It fires the registered OnWordClicked callback for
// the given word index if and only if the index is in range.
func (v *TranscriptView) emitClick(wordIndex int) {
	v.mu.RLock()
	cb := v.onWordClicked
	inRange := wordIndex >= 0 && wordIndex < len(v.words)
	v.mu.RUnlock()

	if cb != nil && inRange {
		cb(wordIndex)
	}
}
