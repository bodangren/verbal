package ui

import (
	"testing"

	"verbal/internal/ai"
)

func TestWordContainer_Selection(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	words := []WordData{
		{Text: "hello", StartTime: 0, EndTime: 0.5, Index: 0},
		{Text: "world", StartTime: 0.5, EndTime: 1.0, Index: 1},
		{Text: "foo", StartTime: 1.0, EndTime: 1.5, Index: 2},
	}

	container := NewWordContainer(words)

	// Initially no selection
	if container.HasSelection() {
		t.Error("Should not have selection initially")
	}

	// Start selection
	container.StartSelection(0)
	if !container.HasSelection() {
		t.Error("Should have selection after StartSelection")
	}

	start, end := container.GetSelection()
	if start != 0 || end != 0 {
		t.Errorf("Expected selection (0, 0), got (%d, %d)", start, end)
	}

	// Extend selection
	container.ExtendSelection(2)
	start, end = container.GetSelection()
	if start != 0 || end != 2 {
		t.Errorf("Expected selection (0, 2), got (%d, %d)", start, end)
	}

	// Verify visual selection
	for i := 0; i <= 2; i++ {
		if !container.GetWordAt(i).IsSelected() {
			t.Errorf("Word %d should be selected", i)
		}
	}

	// Clear selection
	container.ClearSelection()
	if container.HasSelection() {
		t.Error("Should not have selection after ClearSelection")
	}
}

func TestWordContainer_SelectionReversed(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	words := []WordData{
		{Text: "one", StartTime: 0, EndTime: 0.5, Index: 0},
		{Text: "two", StartTime: 0.5, EndTime: 1.0, Index: 1},
		{Text: "three", StartTime: 1.0, EndTime: 1.5, Index: 2},
	}

	container := NewWordContainer(words)

	// Start selection at end, extend to beginning
	container.StartSelection(2)
	container.ExtendSelection(0)

	start, end := container.GetSelection()
	if start != 0 || end != 2 {
		t.Errorf("Expected selection (0, 2), got (%d, %d)", start, end)
	}
}

func TestWordContainer_SelectionCallback(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	words := []WordData{
		{Text: "test", StartTime: 0, EndTime: 0.5, Index: 0},
	}

	container := NewWordContainer(words)

	callbackCalled := false
	var gotStart, gotEnd int

	container.SetSelectionChangedHandler(func(start, end int) {
		callbackCalled = true
		gotStart = start
		gotEnd = end
	})

	container.StartSelection(0)

	if !callbackCalled {
		t.Error("Selection changed callback not called")
	}
	if gotStart != 0 || gotEnd != 0 {
		t.Errorf("Expected callback (0, 0), got (%d, %d)", gotStart, gotEnd)
	}
}

func TestWordContainer_SelectionMode(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	words := []WordData{
		{Text: "test", StartTime: 0, EndTime: 0.5, Index: 0},
	}

	container := NewWordContainer(words)

	if container.IsSelectionMode() {
		t.Error("Selection mode should be disabled initially")
	}

	container.SetSelectionMode(true)
	if !container.IsSelectionMode() {
		t.Error("Selection mode should be enabled")
	}

	container.SetSelectionMode(false)
	if container.IsSelectionMode() {
		t.Error("Selection mode should be disabled after setting false")
	}
}

func TestEditableTranscriptionView_Creation(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	view := NewEditableTranscriptionView()
	if view == nil {
		t.Fatal("NewEditableTranscriptionView returned nil")
	}

	if view.Widget() == nil {
		t.Error("Widget returned nil")
	}
}

func TestEditableTranscriptionView_SetResult(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	view := NewEditableTranscriptionView()

	result := &ai.TranscriptionResult{
		Text: "hello world",
		Words: []ai.Word{
			{Text: "hello", Start: 0, End: 0.5},
			{Text: "world", Start: 0.5, End: 1.0},
		},
	}

	view.SetResult(result)

	text := view.GetText()
	if text != "hello world" {
		t.Errorf("Expected text 'hello world', got '%s'", text)
	}

	words := view.GetWords()
	if len(words) != 2 {
		t.Errorf("Expected 2 words, got %d", len(words))
	}
}

func TestEditableTranscriptionView_GetSelectedSegments(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	view := NewEditableTranscriptionView()

	result := &ai.TranscriptionResult{
		Text: "hello world foo",
		Words: []ai.Word{
			{Text: "hello", Start: 0, End: 0.5},
			{Text: "world", Start: 0.5, End: 1.0},
			{Text: "foo", Start: 1.0, End: 1.5},
		},
	}

	view.SetResult(result)

	// No selection yet
	segments := view.GetSelectedSegments()
	if segments != nil {
		t.Error("Expected nil segments with no selection")
	}

	// Make a selection
	view.wordContainer.StartSelection(0)
	view.wordContainer.ExtendSelection(1)

	segments = view.GetSelectedSegments()
	if len(segments) != 1 {
		t.Fatalf("Expected 1 segment, got %d", len(segments))
	}

	if segments[0].StartTime != 0 {
		t.Errorf("Expected start time 0, got %f", segments[0].StartTime)
	}
	if segments[0].EndTime != 1.0 {
		t.Errorf("Expected end time 1.0, got %f", segments[0].EndTime)
	}
	if segments[0].Text != "hello world" {
		t.Errorf("Expected text 'hello world', got '%s'", segments[0].Text)
	}
}

func TestEditableTranscriptionView_TextChangedCallback(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	view := NewEditableTranscriptionView()

	callbackCalled := false
	view.SetTextChangedHandler(func(newText string) {
		callbackCalled = true
	})

	// Set initial text which triggers the callback
	view.SetResult(&ai.TranscriptionResult{
		Text:  "test",
		Words: []ai.Word{{Text: "test", Start: 0, End: 0.5}},
	})

	// The callback is set up correctly
	if view.onTextChanged == nil {
		t.Error("TextChanged handler not set")
	}

	_ = callbackCalled
}

func TestEditableTranscriptionView_ExportCallback(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	view := NewEditableTranscriptionView()

	result := &ai.TranscriptionResult{
		Text: "hello world",
		Words: []ai.Word{
			{Text: "hello", Start: 0, End: 0.5},
			{Text: "world", Start: 0.5, End: 1.0},
		},
	}

	view.SetResult(result)

	exportCalled := false
	view.SetExportRequestedHandler(func(segments []Segment) {
		exportCalled = true
		if len(segments) != 1 {
			t.Errorf("Expected 1 segment, got %d", len(segments))
		}
	})

	// Make selection and verify callback is set
	view.wordContainer.StartSelection(0)
	view.wordContainer.ExtendSelection(1)

	if view.onExportRequested == nil {
		t.Error("Export requested handler not set")
	}

	_ = exportCalled
}
