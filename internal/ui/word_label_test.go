package ui

import (
	"os"
	"testing"
)

func hasDisplay() bool {
	return os.Getenv("DISPLAY") != "" || os.Getenv("WAYLAND_DISPLAY") != ""
}

func TestNewWordLabel(t *testing.T) {
	// Skip if no display available
	if !hasDisplay() {
		t.Skip("No display available")
	}

	word := WordData{
		Text:      "hello",
		StartTime: 0.5,
		Index:     0,
	}

	label := NewWordLabel(word)
	if label == nil {
		t.Fatal("expected WordLabel, got nil")
	}

	if label.data.Text != "hello" {
		t.Errorf("expected text 'hello', got '%s'", label.data.Text)
	}

	if label.data.StartTime != 0.5 {
		t.Errorf("expected start time 0.5, got %f", label.data.StartTime)
	}
}

func TestWordLabelSetHighlighted(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	word := WordData{Text: "test", StartTime: 1.0, Index: 0}
	label := NewWordLabel(word)

	// Initially not highlighted
	if label.IsHighlighted() {
		t.Error("expected label to not be highlighted initially")
	}

	// Set highlighted
	label.SetHighlighted(true)
	if !label.IsHighlighted() {
		t.Error("expected label to be highlighted after SetHighlighted(true)")
	}

	// Unhighlight
	label.SetHighlighted(false)
	if label.IsHighlighted() {
		t.Error("expected label to not be highlighted after SetHighlighted(false)")
	}
}

func TestWordLabelClickSignal(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	word := WordData{Text: "clickable", StartTime: 2.0, Index: 5}
	label := NewWordLabel(word)

	var clicked bool
	var clickedTime float64
	var clickedIndex int

	label.ConnectClick(func(startTime float64, index int) {
		clicked = true
		clickedTime = startTime
		clickedIndex = index
	})

	// Simulate click by calling the handler directly
	// (In real GTK we'd need to simulate a gesture, but this tests the signal mechanism)
	label.emitClick()

	if !clicked {
		t.Error("expected click signal to fire")
	}
	if clickedTime != 2.0 {
		t.Errorf("expected clicked time 2.0, got %f", clickedTime)
	}
	if clickedIndex != 5 {
		t.Errorf("expected clicked index 5, got %d", clickedIndex)
	}
}

func TestWordLabelCSSClasses(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	word := WordData{Text: "styled", StartTime: 0.0, Index: 0}
	label := NewWordLabel(word)

	// Check that label has base CSS class
	widget := label.Widget()
	if !widget.HasCSSClass("word-label") {
		t.Error("expected word-label CSS class")
	}

	// Set highlighted and check for highlight class
	label.SetHighlighted(true)
	if !widget.HasCSSClass("word-highlighted") {
		t.Error("expected word-highlighted CSS class after highlighting")
	}

	// Remove highlight
	label.SetHighlighted(false)
	if widget.HasCSSClass("word-highlighted") {
		t.Error("expected word-highlighted CSS class to be removed")
	}
}

func TestWordLabelHoverState(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	word := WordData{Text: "hover", StartTime: 0.0, Index: 0}
	label := NewWordLabel(word)

	// Test hover enter
	label.setHover(true)
	if !label.IsHovered() {
		t.Error("expected hover state to be true")
	}

	// Test hover leave
	label.setHover(false)
	if label.IsHovered() {
		t.Error("expected hover state to be false")
	}
}

func TestWordLabelGetData(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	word := WordData{
		Text:      "data",
		StartTime: 3.5,
		Index:     10,
	}
	label := NewWordLabel(word)

	data := label.GetData()
	if data.Text != "data" {
		t.Errorf("expected text 'data', got '%s'", data.Text)
	}
	if data.StartTime != 3.5 {
		t.Errorf("expected start time 3.5, got %f", data.StartTime)
	}
	if data.Index != 10 {
		t.Errorf("expected index 10, got %d", data.Index)
	}
}

func TestWordDataSlice(t *testing.T) {
	words := []WordData{
		{Text: "first", StartTime: 0.0, Index: 0},
		{Text: "second", StartTime: 0.5, Index: 1},
		{Text: "third", StartTime: 1.0, Index: 2},
	}

	// Test that we can create word data slice
	if len(words) != 3 {
		t.Errorf("expected 3 words, got %d", len(words))
	}

	if words[1].Text != "second" {
		t.Errorf("expected 'second' at index 1, got '%s'", words[1].Text)
	}
}
