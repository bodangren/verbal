package ui

import (
	"fmt"
	"sync"

	"github.com/diamondburned/gotk4/pkg/gdk/v4"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// WordData holds the data for a single transcribed word.
// It includes the text, timestamp, and index for synchronization.
type WordData struct {
	Text      string  // The word text
	StartTime float64 // Start timestamp in seconds
	EndTime   float64 // End timestamp in seconds
	Index     int     // Position in the word list
}

// WordLabel is a clickable label widget for displaying a single transcription word.
// It supports highlighting, hover effects, and click signals for video synchronization.
type WordLabel struct {
	label       *gtk.Label
	data        WordData
	highlighted bool
	hovered     bool
	mu          sync.RWMutex

	// clickCallbacks stores functions to call when the word is clicked
	clickCallbacks []func(startTime float64, index int)
}

// NewWordLabel creates a new clickable word label with the given word data.
// The label is styled with the "word-label" CSS class and emits click signals.
func NewWordLabel(data WordData) *WordLabel {
	label := gtk.NewLabel(data.Text + " ") // Add space for natural text flow
	label.AddCSSClass("word-label")
	label.SetCursor(gdk.NewCursorFromName("pointer", nil))

	w := &WordLabel{
		label:          label,
		data:           data,
		clickCallbacks: make([]func(startTime float64, index int), 0),
	}

	// Setup click gesture
	clickGesture := gtk.NewGestureClick()
	clickGesture.SetButton(1) // Left mouse button
	clickGesture.ConnectReleased(func(nPress int, x, y float64) {
		w.emitClick()
	})
	label.AddController(clickGesture)

	// Setup hover controller
	hoverController := gtk.NewEventControllerMotion()
	hoverController.ConnectEnter(func(x, y float64) {
		w.setHover(true)
	})
	hoverController.ConnectLeave(func() {
		w.setHover(false)
	})
	label.AddController(hoverController)

	// Setup keyboard activation (Enter/Space)
	keyController := gtk.NewEventControllerKey()
	keyController.ConnectKeyPressed(func(keyval uint, keycode uint, state gdk.ModifierType) bool {
		if keyval == uint(gdk.KEY_Return) || keyval == uint(gdk.KEY_KP_Enter) || keyval == uint(gdk.KEY_space) {
			w.emitClick()
			return true
		}
		return false
	})
	label.AddController(keyController)

	// Set accessible tooltip for screen readers
	label.SetTooltipText(fmt.Sprintf("Word: %s at %.2fs", data.Text, data.StartTime))

	return w
}

// Widget returns the underlying GTK label widget.
// Use this to add the word label to a container.
func (w *WordLabel) Widget() *gtk.Label {
	return w.label
}

// GetData returns the word data associated with this label.
func (w *WordLabel) GetData() WordData {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.data
}

// SetHighlighted sets the highlighted state of the word.
// When highlighted, the word gets the "word-highlighted" CSS class.
func (w *WordLabel) SetHighlighted(highlighted bool) {
	w.mu.Lock()
	w.highlighted = highlighted
	w.mu.Unlock()

	if highlighted {
		w.label.AddCSSClass("word-highlighted")
	} else {
		w.label.RemoveCSSClass("word-highlighted")
	}
}

// IsHighlighted returns true if the word is currently highlighted.
func (w *WordLabel) IsHighlighted() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.highlighted
}

// setHover sets the hover state of the word (internal use).
func (w *WordLabel) setHover(hovered bool) {
	w.mu.Lock()
	w.hovered = hovered
	w.mu.Unlock()

	if hovered {
		w.label.AddCSSClass("word-hover")
	} else {
		w.label.RemoveCSSClass("word-hover")
	}
}

// IsHovered returns true if the mouse is currently over the word.
func (w *WordLabel) IsHovered() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.hovered
}

// ConnectClick registers a callback to be invoked when the word is clicked.
// The callback receives the word's start time and index.
func (w *WordLabel) ConnectClick(callback func(startTime float64, index int)) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.clickCallbacks = append(w.clickCallbacks, callback)
}

// emitClick triggers all registered click callbacks.
// This is called internally when the word is clicked.
func (w *WordLabel) emitClick() {
	w.mu.RLock()
	callbacks := make([]func(startTime float64, index int), len(w.clickCallbacks))
	copy(callbacks, w.clickCallbacks)
	w.mu.RUnlock()

	for _, cb := range callbacks {
		cb(w.data.StartTime, w.data.Index)
	}
}
