package ui

import (
	"sync"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// WordContainer is a widget that displays a collection of clickable word labels
// in a flowing layout that wraps like text. It manages word highlighting and
// click-to-seek functionality for video synchronization.
type WordContainer struct {
	flowBox *gtk.FlowBox
	words   []*WordLabel
	mu      sync.RWMutex

	onWordClick func(startTime float64, index int)
}

// NewWordContainer creates a new word container with the given words.
// The container uses a flow box layout that wraps words like text.
func NewWordContainer(words []WordData) *WordContainer {
	flowBox := gtk.NewFlowBox()
	flowBox.SetSelectionMode(gtk.SelectionNone)
	flowBox.SetRowSpacing(4)
	flowBox.SetColumnSpacing(2)
	flowBox.SetHomogeneous(false)
	flowBox.AddCSSClass("word-container")

	wc := &WordContainer{
		flowBox:     flowBox,
		words:       make([]*WordLabel, 0, len(words)),
		onWordClick: nil,
	}

	// Create and add word labels
	for i, wordData := range words {
		wordData.Index = i
		label := NewWordLabel(wordData)
		label.ConnectClick(wc.handleWordClick)
		wc.words = append(wc.words, label)
		flowBox.Append(label.Widget())
	}

	return wc
}

// Widget returns the underlying GTK flow box widget.
func (wc *WordContainer) Widget() *gtk.FlowBox {
	return wc.flowBox
}

// SetWordClickHandler sets the callback for when a word is clicked.
// The callback receives the word's start time and index.
func (wc *WordContainer) SetWordClickHandler(handler func(startTime float64, index int)) {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	wc.onWordClick = handler
}

// handleWordClick is the internal click handler that delegates to the registered callback.
func (wc *WordContainer) handleWordClick(startTime float64, index int) {
	wc.mu.RLock()
	handler := wc.onWordClick
	wc.mu.RUnlock()

	if handler != nil {
		handler(startTime, index)
	}
}

// SetHighlightedWord sets the highlighted state for a specific word by index.
// Only one word can be highlighted at a time; previous highlights are cleared.
func (wc *WordContainer) SetHighlightedWord(index int) {
	wc.mu.Lock()
	defer wc.mu.Unlock()

	// Clear all highlights first
	for _, word := range wc.words {
		word.SetHighlighted(false)
	}

	// Set new highlight if valid
	if index >= 0 && index < len(wc.words) {
		wc.words[index].SetHighlighted(true)
	}
}

// GetWordCount returns the total number of words in the container.
func (wc *WordContainer) GetWordCount() int {
	wc.mu.RLock()
	defer wc.mu.RUnlock()
	return len(wc.words)
}

// GetWordAt returns the word label at the given index.
// Returns nil if the index is out of bounds.
func (wc *WordContainer) GetWordAt(index int) *WordLabel {
	wc.mu.RLock()
	defer wc.mu.RUnlock()

	if index < 0 || index >= len(wc.words) {
		return nil
	}
	return wc.words[index]
}

// Clear removes all words from the container.
func (wc *WordContainer) Clear() {
	wc.mu.Lock()
	defer wc.mu.Unlock()

	for _, word := range wc.words {
		wc.flowBox.Remove(word.Widget())
	}
	wc.words = wc.words[:0]
}

// SetWords replaces all words in the container with a new set.
func (wc *WordContainer) SetWords(words []WordData) {
	wc.Clear()

	wc.mu.Lock()
	defer wc.mu.Unlock()

	for i, wordData := range words {
		wordData.Index = i
		label := NewWordLabel(wordData)
		label.ConnectClick(wc.handleWordClick)
		wc.words = append(wc.words, label)
		wc.flowBox.Append(label.Widget())
	}
}

// GetHighlightedWord returns the index of the currently highlighted word,
// or -1 if no word is highlighted.
func (wc *WordContainer) GetHighlightedWord() int {
	wc.mu.RLock()
	defer wc.mu.RUnlock()

	for i, word := range wc.words {
		if word.IsHighlighted() {
			return i
		}
	}
	return -1
}
