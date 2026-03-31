package sync

import (
	"fmt"
	"testing"

	"verbal/internal/ai"
)

func TestNewController(t *testing.T) {
	words := []ai.Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "world", Start: 0.6, End: 1.0},
	}
	result := &ai.TranscriptionResult{Words: words}

	ctrl := NewController(result)
	if ctrl == nil {
		t.Fatal("expected controller, got nil")
	}

	if len(ctrl.words) != 2 {
		t.Errorf("expected 2 words, got %d", len(ctrl.words))
	}
}

func TestControllerWithNilResult(t *testing.T) {
	ctrl := NewController(nil)
	if ctrl == nil {
		t.Fatal("expected controller, got nil")
	}

	if len(ctrl.words) != 0 {
		t.Errorf("expected 0 words, got %d", len(ctrl.words))
	}
}

func TestGetCurrentWordIndex(t *testing.T) {
	words := []ai.Word{
		{Text: "first", Start: 0.0, End: 0.5},
		{Text: "second", Start: 0.6, End: 1.0},
		{Text: "third", Start: 1.1, End: 1.5},
		{Text: "fourth", Start: 1.6, End: 2.0},
	}
	result := &ai.TranscriptionResult{Words: words}
	ctrl := NewController(result)

	tests := []struct {
		position float64
		wantIdx  int
	}{
		{position: 0.0, wantIdx: 0},   // Exact start of first word
		{position: 0.3, wantIdx: 0},   // Middle of first word
		{position: 0.6, wantIdx: 1},   // Exact start of second word
		{position: 0.8, wantIdx: 1},   // Middle of second word
		{position: 1.1, wantIdx: 2},   // Exact start of third word
		{position: 1.8, wantIdx: 3},   // Middle of fourth word
		{position: -0.5, wantIdx: -1}, // Before first word
		{position: 5.0, wantIdx: 3},   // After last word
		{position: 0.55, wantIdx: 0},  // Gap between first and second (should return first)
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("position_%.1f", tt.position), func(t *testing.T) {
			got := ctrl.GetCurrentWordIndex(tt.position)
			if got != tt.wantIdx {
				t.Errorf("GetCurrentWordIndex(%.1f) = %d, want %d", tt.position, got, tt.wantIdx)
			}
		})
	}
}

func TestGetCurrentWordIndexEmpty(t *testing.T) {
	ctrl := NewController(&ai.TranscriptionResult{Words: []ai.Word{}})

	idx := ctrl.GetCurrentWordIndex(1.0)
	if idx != -1 {
		t.Errorf("expected -1 for empty words, got %d", idx)
	}
}

func TestSeekToWord(t *testing.T) {
	words := []ai.Word{
		{Text: "first", Start: 0.0, End: 0.5},
		{Text: "second", Start: 0.6, End: 1.0},
		{Text: "third", Start: 1.1, End: 1.5},
	}
	result := &ai.TranscriptionResult{Words: words}
	ctrl := NewController(result)

	tests := []struct {
		wordIdx int
		wantPos float64
		wantErr bool
	}{
		{wordIdx: 0, wantPos: 0.0, wantErr: false},
		{wordIdx: 1, wantPos: 0.6, wantErr: false},
		{wordIdx: 2, wantPos: 1.1, wantErr: false},
		{wordIdx: -1, wantPos: 0, wantErr: true},
		{wordIdx: 5, wantPos: 0, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("word_%d", tt.wordIdx), func(t *testing.T) {
			got, err := ctrl.SeekToWord(tt.wordIdx)
			if tt.wantErr {
				if err == nil {
					t.Errorf("SeekToWord(%d) expected error, got nil", tt.wordIdx)
				}
				return
			}
			if err != nil {
				t.Errorf("SeekToWord(%d) unexpected error: %v", tt.wordIdx, err)
				return
			}
			if got != tt.wantPos {
				t.Errorf("SeekToWord(%d) = %.1f, want %.1f", tt.wordIdx, got, tt.wantPos)
			}
		})
	}
}

func TestPositionCallbacks(t *testing.T) {
	words := []ai.Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "world", Start: 0.6, End: 1.0},
	}
	result := &ai.TranscriptionResult{Words: words}
	ctrl := NewController(result)

	var callCount int
	var lastPosition float64

	// Register callback
	unreg := ctrl.RegisterPositionCallback(func(pos float64) {
		callCount++
		lastPosition = pos
	})

	// Update position
	ctrl.UpdatePosition(0.3)

	if callCount != 1 {
		t.Errorf("expected 1 callback, got %d", callCount)
	}
	if lastPosition != 0.3 {
		t.Errorf("expected position 0.3, got %.1f", lastPosition)
	}

	// Update again
	ctrl.UpdatePosition(0.8)
	if callCount != 2 {
		t.Errorf("expected 2 callbacks, got %d", callCount)
	}

	// Unregister
	unreg()
	ctrl.UpdatePosition(1.5)
	if callCount != 2 {
		t.Errorf("expected still 2 callbacks after unregister, got %d", callCount)
	}
}

func TestMultipleCallbacks(t *testing.T) {
	ctrl := NewController(&ai.TranscriptionResult{})

	var count1, count2 int

	ctrl.RegisterPositionCallback(func(pos float64) {
		count1++
	})
	ctrl.RegisterPositionCallback(func(pos float64) {
		count2++
	})

	ctrl.UpdatePosition(1.0)

	if count1 != 1 || count2 != 1 {
		t.Errorf("expected both callbacks to fire once, got %d and %d", count1, count2)
	}
}

func TestWordChangeCallbacks(t *testing.T) {
	words := []ai.Word{
		{Text: "first", Start: 0.0, End: 0.5},
		{Text: "second", Start: 0.6, End: 1.0},
	}
	result := &ai.TranscriptionResult{Words: words}
	ctrl := NewController(result)

	var wordChanges []int
	unreg := ctrl.RegisterWordChangeCallback(func(wordIdx int) {
		wordChanges = append(wordChanges, wordIdx)
	})
	defer unreg()

	// Update to first word
	ctrl.UpdatePosition(0.2)
	if len(wordChanges) != 1 || wordChanges[0] != 0 {
		t.Errorf("expected callback for word 0, got %v", wordChanges)
	}

	// Stay on first word - no callback
	ctrl.UpdatePosition(0.3)
	if len(wordChanges) != 1 {
		t.Errorf("expected no new callback for same word, got %v", wordChanges)
	}

	// Move to second word
	ctrl.UpdatePosition(0.8)
	if len(wordChanges) != 2 || wordChanges[1] != 1 {
		t.Errorf("expected callback for word 1, got %v", wordChanges)
	}
}

func TestGetWordCount(t *testing.T) {
	ctrl := NewController(&ai.TranscriptionResult{
		Words: []ai.Word{
			{Text: "one"},
			{Text: "two"},
			{Text: "three"},
		},
	})

	if ctrl.GetWordCount() != 3 {
		t.Errorf("expected word count 3, got %d", ctrl.GetWordCount())
	}
}

func TestGetWordAt(t *testing.T) {
	words := []ai.Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "world", Start: 0.6, End: 1.0},
	}
	ctrl := NewController(&ai.TranscriptionResult{Words: words})

	word, err := ctrl.GetWordAt(0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if word.Text != "hello" {
		t.Errorf("expected 'hello', got '%s'", word.Text)
	}

	word, err = ctrl.GetWordAt(1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if word.Text != "world" {
		t.Errorf("expected 'world', got '%s'", word.Text)
	}

	_, err = ctrl.GetWordAt(-1)
	if err == nil {
		t.Error("expected error for negative index")
	}

	_, err = ctrl.GetWordAt(5)
	if err == nil {
		t.Error("expected error for out of bounds index")
	}
}

func TestGetCurrentPosition(t *testing.T) {
	words := []ai.Word{
		{Text: "hello", Start: 0.0, End: 0.5},
		{Text: "world", Start: 0.6, End: 1.0},
	}
	ctrl := NewController(&ai.TranscriptionResult{Words: words})

	// Initial position should be 0
	if ctrl.GetCurrentPosition() != 0 {
		t.Errorf("expected initial position 0, got %f", ctrl.GetCurrentPosition())
	}

	// Update position and verify
	ctrl.UpdatePosition(0.3)
	if ctrl.GetCurrentPosition() != 0.3 {
		t.Errorf("expected position 0.3, got %f", ctrl.GetCurrentPosition())
	}

	// Update to another position
	ctrl.UpdatePosition(1.5)
	if ctrl.GetCurrentPosition() != 1.5 {
		t.Errorf("expected position 1.5, got %f", ctrl.GetCurrentPosition())
	}
}

func TestGetCurrentWordIndexCached(t *testing.T) {
	words := []ai.Word{
		{Text: "first", Start: 0.0, End: 0.5},
		{Text: "second", Start: 0.6, End: 1.0},
		{Text: "third", Start: 1.1, End: 1.5},
	}
	ctrl := NewController(&ai.TranscriptionResult{Words: words})

	// Initial cached index should be -1
	if ctrl.GetCurrentWordIndexCached() != -1 {
		t.Errorf("expected initial cached index -1, got %d", ctrl.GetCurrentWordIndexCached())
	}

	// Update position to first word
	ctrl.UpdatePosition(0.2)
	if ctrl.GetCurrentWordIndexCached() != 0 {
		t.Errorf("expected cached index 0, got %d", ctrl.GetCurrentWordIndexCached())
	}

	// Update position within same word - cached index shouldn't change
	ctrl.UpdatePosition(0.4)
	if ctrl.GetCurrentWordIndexCached() != 0 {
		t.Errorf("expected cached index still 0, got %d", ctrl.GetCurrentWordIndexCached())
	}

	// Update position to second word
	ctrl.UpdatePosition(0.8)
	if ctrl.GetCurrentWordIndexCached() != 1 {
		t.Errorf("expected cached index 1, got %d", ctrl.GetCurrentWordIndexCached())
	}

	// Update position to third word
	ctrl.UpdatePosition(1.3)
	if ctrl.GetCurrentWordIndexCached() != 2 {
		t.Errorf("expected cached index 2, got %d", ctrl.GetCurrentWordIndexCached())
	}

	// Update position after last word - should remain on last word
	ctrl.UpdatePosition(2.0)
	if ctrl.GetCurrentWordIndexCached() != 2 {
		t.Errorf("expected cached index 2 (last word), got %d", ctrl.GetCurrentWordIndexCached())
	}
}
