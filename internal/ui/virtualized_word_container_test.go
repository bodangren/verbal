package ui

import (
	"testing"
)

func TestVirtualizedWordContainer_FirstVisibleWordIndex_Empty(t *testing.T) {
	vwc := &VirtualizedWordContainer{
		words: []WordData{},
	}
	got := vwc.firstVisibleWordIndex(0.0, 0.1)
	if got != 0 {
		t.Errorf("expected 0 for empty words, got %d", got)
	}
}

func TestVirtualizedWordContainer_FirstVisibleWordIndex_BinarySearch(t *testing.T) {
	words := []WordData{
		{Text: "one", StartTime: 0.0, EndTime: 1.0, Index: 0},
		{Text: "two", StartTime: 1.0, EndTime: 2.0, Index: 1},
		{Text: "three", StartTime: 2.0, EndTime: 3.0, Index: 2},
		{Text: "four", StartTime: 3.0, EndTime: 4.0, Index: 3},
		{Text: "five", StartTime: 4.0, EndTime: 5.0, Index: 4},
	}
	vwc := &VirtualizedWordContainer{words: words}

	tests := []struct {
		name         string
		scrollOffset float64
		visibleRatio float64
		wantStart    int
	}{
		{"start of recording", 0.0, 0.2, 0},
		{"middle of recording", 0.5, 0.2, 2},
		{"end of recording", 0.8, 0.2, 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := vwc.firstVisibleWordIndex(tt.scrollOffset, tt.visibleRatio)
			if got != tt.wantStart {
				t.Errorf("firstVisibleWordIndex(%v, %v) = %v, want %v",
					tt.scrollOffset, tt.visibleRatio, got, tt.wantStart)
			}
		})
	}
}

func TestVirtualizedWordContainer_LastVisibleWordIndex_BinarySearch(t *testing.T) {
	words := []WordData{
		{Text: "one", StartTime: 0.0, EndTime: 1.0, Index: 0},
		{Text: "two", StartTime: 1.0, EndTime: 2.0, Index: 1},
		{Text: "three", StartTime: 2.0, EndTime: 3.0, Index: 2},
		{Text: "four", StartTime: 3.0, EndTime: 4.0, Index: 3},
		{Text: "five", StartTime: 4.0, EndTime: 5.0, Index: 4},
	}
	vwc := &VirtualizedWordContainer{words: words}

	tests := []struct {
		name         string
		scrollOffset float64
		visibleRatio float64
		wantEnd      int
	}{
		{"start of recording", 0.0, 0.2, 0},
		{"middle of recording", 0.5, 0.2, 3},
		{"end of recording", 0.8, 0.2, 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := vwc.lastVisibleWordIndex(tt.scrollOffset, tt.visibleRatio)
			if got != tt.wantEnd {
				t.Errorf("lastVisibleWordIndex(%v, %v) = %v, want %v",
					tt.scrollOffset, tt.visibleRatio, got, tt.wantEnd)
			}
		})
	}
}

func TestVirtualizedWordContainer_GetWordCount(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	words := []WordData{
		{Text: "one", StartTime: 0, EndTime: 0.5, Index: 0},
		{Text: "two", StartTime: 0.5, EndTime: 1.0, Index: 1},
	}
	vwc := NewVirtualizedWordContainer(words)

	got := vwc.GetWordCount()
	if got != 2 {
		t.Errorf("expected 2 words, got %d", got)
	}
}

func TestVirtualizedWordContainer_SetWords(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	vwc := NewVirtualizedWordContainer(nil)

	words := []WordData{
		{Text: "hello", StartTime: 0, EndTime: 0.5, Index: 0},
	}
	vwc.SetWords(words)

	got := vwc.GetWordCount()
	if got != 1 {
		t.Errorf("expected 1 word after SetWords, got %d", got)
	}
}

func TestVirtualizedWordContainer_Clear(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	words := []WordData{
		{Text: "one", StartTime: 0, EndTime: 0.5, Index: 0},
	}
	vwc := NewVirtualizedWordContainer(words)

	vwc.Clear()

	if vwc.GetWordCount() != 0 {
		t.Errorf("expected 0 words after Clear, got %d", vwc.GetWordCount())
	}
}

func TestVirtualizedWordContainer_SelectionMode(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	vwc := NewVirtualizedWordContainer(nil)

	if vwc.IsSelectionMode() {
		t.Error("selection mode should be disabled initially")
	}

	vwc.SetSelectionMode(true)
	if !vwc.IsSelectionMode() {
		t.Error("selection mode should be enabled after SetSelectionMode(true)")
	}

	vwc.SetSelectionMode(false)
	if vwc.IsSelectionMode() {
		t.Error("selection mode should be disabled after SetSelectionMode(false)")
	}
}

func TestVirtualizedWordContainer_StartSelection(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	words := []WordData{
		{Text: "one", StartTime: 0, EndTime: 0.5, Index: 0},
		{Text: "two", StartTime: 0.5, EndTime: 1.0, Index: 1},
	}
	vwc := NewVirtualizedWordContainer(words)

	vwc.StartSelection(0)

	if !vwc.HasSelection() {
		t.Error("should have selection after StartSelection")
	}

	start, end := vwc.GetSelection()
	if start != 0 || end != 0 {
		t.Errorf("expected selection (0, 0), got (%d, %d)", start, end)
	}
}

func TestVirtualizedWordContainer_ExtendSelection(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	words := []WordData{
		{Text: "one", StartTime: 0, EndTime: 0.5, Index: 0},
		{Text: "two", StartTime: 0.5, EndTime: 1.0, Index: 1},
		{Text: "three", StartTime: 1.0, EndTime: 1.5, Index: 2},
	}
	vwc := NewVirtualizedWordContainer(words)

	vwc.StartSelection(0)
	vwc.ExtendSelection(2)

	start, end := vwc.GetSelection()
	if start != 0 || end != 2 {
		t.Errorf("expected selection (0, 2), got (%d, %d)", start, end)
	}
}

func TestVirtualizedWordContainer_ClearSelection(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	words := []WordData{
		{Text: "one", StartTime: 0, EndTime: 0.5, Index: 0},
	}
	vwc := NewVirtualizedWordContainer(words)

	vwc.StartSelection(0)
	vwc.ClearSelection()

	if vwc.HasSelection() {
		t.Error("should not have selection after ClearSelection")
	}
}

func TestVirtualizedWordContainer_SetHighlightedWord(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	words := []WordData{
		{Text: "one", StartTime: 0, EndTime: 0.5, Index: 0},
		{Text: "two", StartTime: 0.5, EndTime: 1.0, Index: 1},
	}
	vwc := NewVirtualizedWordContainer(words)

	vwc.SetHighlightedWord(0)
	vwc.SetHighlightedWord(1)
}

func TestVirtualizedWordContainer_GetWords(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}
	words := []WordData{
		{Text: "hello", StartTime: 0, EndTime: 0.5, Index: 0},
		{Text: "world", StartTime: 0.5, EndTime: 1.0, Index: 1},
	}
	vwc := NewVirtualizedWordContainer(words)

	got := vwc.GetWords()
	if len(got) != 2 {
		t.Errorf("expected 2 words, got %d", len(got))
	}
}
