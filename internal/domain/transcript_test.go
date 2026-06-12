package domain

import (
	"strings"
	"testing"
	"time"
)

func makeWords(t *testing.T, count int) []Word {
	t.Helper()
	words := make([]Word, count)
	for i := 0; i < count; i++ {
		w, err := NewWord("word", time.Duration(i)*time.Second, time.Duration(i+1)*time.Second, nil)
		if err != nil {
			t.Fatalf("failed to create word: %v", err)
		}
		words[i] = w
	}
	return words
}

func TestNewTranscript(t *testing.T) {
	validWords := makeWords(t, 2)
	unorderedWords := []Word{validWords[1], validWords[0]}

	tests := []struct {
		name        string
		recordingID int64
		language    string
		words       []Word
		wantErr     bool
		errContains string
	}{
		{
			name:        "valid transcript",
			recordingID: 1,
			language:    "en",
			words:       validWords,
			wantErr:     false,
		},
		{
			name:        "zero recording id",
			recordingID: 0,
			language:    "en",
			words:       validWords,
			wantErr:     true,
			errContains: "recording id must be positive",
		},
		{
			name:        "negative recording id",
			recordingID: -1,
			language:    "en",
			words:       validWords,
			wantErr:     true,
			errContains: "recording id must be positive",
		},
		{
			name:        "invalid word",
			recordingID: 1,
			language:    "en",
			words:       []Word{{Text: "", Start: 0, End: time.Second}},
			wantErr:     true,
			errContains: "word 0",
		},
		{
			name:        "unordered words",
			recordingID: 1,
			language:    "en",
			words:       unorderedWords,
			wantErr:     true,
			errContains: "word 1 starts before word 0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tr, err := NewTranscript(tt.recordingID, tt.language, tt.words)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errContains)
				}
				if tt.errContains != "" && !strings.Contains(err.Error(), tt.errContains) {
					t.Fatalf("expected error containing %q, got %q", tt.errContains, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tr.RecordingID != tt.recordingID {
				t.Errorf("RecordingID = %d, want %d", tr.RecordingID, tt.recordingID)
			}
			if tr.Language != tt.language {
				t.Errorf("Language = %q, want %q", tr.Language, tt.language)
			}
			if len(tr.Words) != len(tt.words) {
				t.Errorf("len(Words) = %d, want %d", len(tr.Words), len(tt.words))
			}
		})
	}
}

func TestTranscriptWordIndexAt(t *testing.T) {
	words := []Word{
		{Text: "one", Start: 0, End: time.Second},
		{Text: "two", Start: time.Second, End: 2 * time.Second},
		{Text: "three", Start: 2 * time.Second, End: 3 * time.Second},
	}
	tr, err := NewTranscript(1, "en", words)
	if err != nil {
		t.Fatalf("failed to create transcript: %v", err)
	}

	tests := []struct {
		name     string
		position time.Duration
		wantIdx  int
	}{
		{"before first word", -time.Second, -1},
		{"at word start", 0, 0},
		{"inside first word", 500 * time.Millisecond, 0},
		{"between words", 1500 * time.Millisecond, 1},
		{"inside last word", 2500 * time.Millisecond, 2},
		{"after last word", 5 * time.Second, -1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tr.WordIndexAt(tt.position)
			if got != tt.wantIdx {
				t.Errorf("WordIndexAt(%v) = %d, want %d", tt.position, got, tt.wantIdx)
			}
		})
	}
}

func TestTranscriptWordAt(t *testing.T) {
	words := []Word{
		{Text: "one", Start: 0, End: time.Second},
	}
	tr, err := NewTranscript(1, "en", words)
	if err != nil {
		t.Fatalf("failed to create transcript: %v", err)
	}

	w, err := tr.WordAt(500 * time.Millisecond)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if w.Text != "one" {
		t.Errorf("WordAt text = %q, want %q", w.Text, "one")
	}

	_, err = tr.WordAt(5 * time.Second)
	if err == nil {
		t.Fatal("expected error for out-of-range position")
	}
}
