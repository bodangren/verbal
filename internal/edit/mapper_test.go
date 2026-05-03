package edit

import (
	"testing"
)

func TestTranscriptMapper_WordAtTime(t *testing.T) {
	words := []WordData{
		NewWordData("hello", 0.0, 0.5, 0),
		NewWordData("world", 0.5, 1.0, 1),
		NewWordData("test", 1.0, 1.5, 2),
		NewWordData("case", 1.5, 2.0, 3),
	}

	tm := NewTranscriptMapper(words)

	tests := []struct {
		name     string
		time     float64
		wantIdx  int
	}{
		{"at start of first word", 0.0, 0},
		{"at start of second word", 0.5, 1},
		{"mid first word", 0.25, 0},
		{"before last word", 1.9, 3},
		{"after last word", 2.5, 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tm.WordAtTime(tt.time)
			if got != tt.wantIdx {
				t.Errorf("WordAtTime(%v) = %v, want %v", tt.time, got, tt.wantIdx)
			}
		})
	}

	t.Run("empty mapper", func(t *testing.T) {
		emptyTm := NewTranscriptMapper(nil)
		got := emptyTm.WordAtTime(0.0)
		if got != -1 {
			t.Errorf("WordAtTime() = %v, want -1", got)
		}
	})
}

func TestTranscriptMapper_TimeRangeForWords(t *testing.T) {
	words := []WordData{
		NewWordData("hello", 0.0, 0.5, 0),
		NewWordData("world", 0.5, 1.0, 1),
		NewWordData("test", 1.0, 1.5, 2),
		NewWordData("case", 1.5, 2.0, 3),
	}

	tm := NewTranscriptMapper(words)

	tests := []struct {
		name     string
		fromIdx  int
		toIdx    int
		wantStart float64
		wantEnd   float64
	}{
		{"single word range", 1, 2, 0.5, 1.0},
		{"multi word range", 0, 3, 0.0, 1.5},
		{"full range", 0, 4, 0.0, 2.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotStart, gotEnd := tm.TimeRangeForWords(tt.fromIdx, tt.toIdx)
			if gotStart != tt.wantStart {
				t.Errorf("TimeRangeForWords start = %v, want %v", gotStart, tt.wantStart)
			}
			if gotEnd != tt.wantEnd {
				t.Errorf("TimeRangeForWords end = %v, want %v", gotEnd, tt.wantEnd)
			}
		})
	}
}

func TestTranscriptMapper_SentenceBoundaries(t *testing.T) {
	words := []WordData{
		NewWordData("Hello.", 0.0, 0.5, 0),
		NewWordData("world", 0.5, 1.0, 1),
		NewWordData("This", 1.0, 1.5, 2),
		NewWordData("is", 1.5, 2.0, 3),
		NewWordData("good!", 2.0, 2.5, 4),
		NewWordData("test", 2.5, 3.0, 5),
	}

	tm := NewTranscriptMapper(words)
	boundaries := tm.SentenceBoundaries()

	if len(boundaries) < 1 {
		t.Errorf("SentenceBoundaries() got %d boundaries, want at least 1", len(boundaries))
	}
}

func TestTranscriptMapper_Duration(t *testing.T) {
	words := []WordData{
		NewWordData("hello", 0.0, 0.5, 0),
		NewWordData("world", 0.5, 1.0, 1),
	}

	tm := NewTranscriptMapper(words)
	duration := tm.Duration()

	if duration != 1.0 {
		t.Errorf("Duration() = %v, want 1.0", duration)
	}

	emptyTm := NewTranscriptMapper(nil)
	if emptyTm.Duration() != 0 {
		t.Errorf("Duration() for empty = %v, want 0", emptyTm.Duration())
	}
}
