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

	onWordClick     func(startTime float64, index int)
	onWordHighlight func(index int)

	// lastHighlightedIndex tracks the currently highlighted word to avoid
	// iterating all words on every position update (O(1) instead of O(n)).
	lastHighlightedIndex int

	// Selection state for segment export
	selectionStart     int
	selectionEnd       int
	isSelecting        bool
	onSelectionChanged func(start, end int)
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
		flowBox:              flowBox,
		words:                make([]*WordLabel, 0, len(words)),
		onWordClick:          nil,
		lastHighlightedIndex: -1,
		selectionStart:       -1,
		selectionEnd:         -1,
		isSelecting:          false,
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
// This method is O(1) because it tracks the last highlighted index.
func (wc *WordContainer) SetHighlightedWord(index int) {
	wc.mu.Lock()
	defer wc.mu.Unlock()

	// Clear previous highlight only (O(1) instead of iterating all words)
	if wc.lastHighlightedIndex >= 0 && wc.lastHighlightedIndex < len(wc.words) {
		wc.words[wc.lastHighlightedIndex].SetHighlighted(false)
	}

	// Set new highlight if valid
	if index >= 0 && index < len(wc.words) {
		wc.words[index].SetHighlighted(true)
		wc.lastHighlightedIndex = index
	} else {
		wc.lastHighlightedIndex = -1
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
	wc.lastHighlightedIndex = -1
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

// ScrollToWord attempts to scroll the container to make the word at the given index visible.
// Note: This requires the FlowBox to be inside a ScrolledWindow to have any effect.
// Returns true if the word was found and scrolled to, false otherwise.
func (wc *WordContainer) ScrollToWord(index int) bool {
	wc.mu.RLock()
	defer wc.mu.RUnlock()

	if index < 0 || index >= len(wc.words) {
		return false
	}

	// Select the child to make it visible (GTK4 FlowBox doesn't have ScrollToChild)
	// The selection will highlight it visually and help with focus
	child := wc.flowBox.ChildAtIndex(index)
	if child != nil {
		wc.flowBox.SelectChild(child)
		return true
	}
	return false
}

// ConnectToSyncController connects this word container to a sync controller.
// This sets up automatic highlighting based on playback position and click-to-seek.
// The syncController should provide position updates via callbacks.
//
// Example usage:
//
//	container.ConnectToSyncController(syncCtrl, func(pos float64) {
//	    videoPlayer.SeekTo(pos)
//	})
func (wc *WordContainer) ConnectToSyncController(
	onWordClick func(startTime float64),
	onHighlight func(index int),
) {
	// Set up click handler
	wc.SetWordClickHandler(func(startTime float64, index int) {
		if onWordClick != nil {
			onWordClick(startTime)
		}
	})

	// Set up highlight handler
	wc.onWordHighlight = onHighlight
}

// SetSelectionMode enables or disables word selection mode.
// When enabled, clicking words selects ranges instead of seeking.
func (wc *WordContainer) SetSelectionMode(enabled bool) {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	wc.isSelecting = enabled
	if !enabled {
		wc.clearSelection()
	}
}

// IsSelectionMode returns whether selection mode is enabled.
func (wc *WordContainer) IsSelectionMode() bool {
	wc.mu.RLock()
	defer wc.mu.RUnlock()
	return wc.isSelecting
}

// StartSelection begins a selection at the given word index.
func (wc *WordContainer) StartSelection(index int) {
	wc.mu.Lock()
	defer wc.mu.Unlock()

	if index < 0 || index >= len(wc.words) {
		return
	}

	wc.selectionStart = index
	wc.selectionEnd = index
	wc.updateSelectionVisuals()

	if wc.onSelectionChanged != nil {
		wc.onSelectionChanged(index, index)
	}
}

// ExtendSelection extends the current selection to include the given word index.
func (wc *WordContainer) ExtendSelection(index int) {
	wc.mu.Lock()
	defer wc.mu.Unlock()

	if index < 0 || index >= len(wc.words) {
		return
	}

	wc.selectionEnd = index
	wc.updateSelectionVisuals()

	start := wc.selectionStart
	end := wc.selectionEnd
	if start > end {
		start, end = end, start
	}

	if wc.onSelectionChanged != nil {
		wc.onSelectionChanged(start, end)
	}
}

// ClearSelection removes the current selection.
func (wc *WordContainer) ClearSelection() {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	wc.clearSelection()
}

func (wc *WordContainer) clearSelection() {
	for _, word := range wc.words {
		word.SetSelected(false)
	}
	wc.selectionStart = -1
	wc.selectionEnd = -1

	if wc.onSelectionChanged != nil {
		wc.onSelectionChanged(-1, -1)
	}
}

// GetSelection returns the current selection range (start, end).
// Returns (-1, -1) if no selection.
func (wc *WordContainer) GetSelection() (int, int) {
	wc.mu.RLock()
	defer wc.mu.RUnlock()

	start := wc.selectionStart
	end := wc.selectionEnd
	if start > end {
		start, end = end, start
	}
	return start, end
}

// HasSelection returns true if there is an active selection.
func (wc *WordContainer) HasSelection() bool {
	wc.mu.RLock()
	defer wc.mu.RUnlock()
	return wc.selectionStart >= 0 && wc.selectionEnd >= 0
}

// SetSelectionChangedHandler sets the callback for selection changes.
func (wc *WordContainer) SetSelectionChangedHandler(handler func(start, end int)) {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	wc.onSelectionChanged = handler
}

func (wc *WordContainer) updateSelectionVisuals() {
	start := wc.selectionStart
	end := wc.selectionEnd
	if start > end {
		start, end = end, start
	}

	for i, word := range wc.words {
		word.SetSelected(i >= start && i <= end)
	}
}
