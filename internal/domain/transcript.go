package domain

import (
	"fmt"
	"time"
)

// Transcript holds the transcription result for a recording.
type Transcript struct {
	RecordingID int64
	Language    string
	Words       []Word
}

// NewTranscript creates a validated Transcript.
func NewTranscript(recordingID int64, language string, words []Word) (Transcript, error) {
	t := Transcript{
		RecordingID: recordingID,
		Language:    language,
		Words:       words,
	}
	if err := t.Validate(); err != nil {
		return Transcript{}, err
	}
	return t, nil
}

// EmptyTranscript returns a Transcript with no words.
func EmptyTranscript(recordingID int64, language string) Transcript {
	return Transcript{
		RecordingID: recordingID,
		Language:    language,
		Words:       []Word{},
	}
}

// WordAt returns the word whose time range contains the given position,
// or an error if no word matches.
func (t Transcript) WordAt(position time.Duration) (Word, error) {
	idx := t.WordIndexAt(position)
	if idx < 0 {
		return Word{}, fmt.Errorf("no word at position %v", position)
	}
	return t.Words[idx], nil
}

// WordIndexAt returns the index of the word whose time range contains the
// given position, or -1 if no word matches.
func (t Transcript) WordIndexAt(position time.Duration) int {
	// Binary search for O(log n) lookup.
	lo, hi := 0, len(t.Words)
	for lo < hi {
		mid := (lo + hi) / 2
		w := t.Words[mid]
		if position < w.Start {
			hi = mid
		} else if position >= w.End {
			lo = mid + 1
		} else {
			return mid
		}
	}
	return -1
}

// Validate returns an error if the transcript is invalid.
func (t Transcript) Validate() error {
	if t.RecordingID <= 0 {
		return fmt.Errorf("transcript recording id must be positive: %d", t.RecordingID)
	}
	for i, w := range t.Words {
		if err := w.Validate(); err != nil {
			return fmt.Errorf("word %d: %w", i, err)
		}
		if i > 0 && w.Start < t.Words[i-1].Start {
			return fmt.Errorf("word %d starts before word %d", i, i-1)
		}
	}
	return nil
}
