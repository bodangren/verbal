// Package domain contains the core business types for Verbal.
package domain

import (
	"fmt"
	"time"
)

// Word represents a single transcribed word with timing and optional confidence.
type Word struct {
	Text       string
	Start      time.Duration
	End        time.Duration
	Confidence *float64
}

// NewWord creates a validated Word.
func NewWord(text string, start, end time.Duration, confidence *float64) (Word, error) {
	w := Word{
		Text:       text,
		Start:      start,
		End:        end,
		Confidence: confidence,
	}
	if err := w.Validate(); err != nil {
		return Word{}, err
	}
	return w, nil
}

// Duration returns the word's elapsed time.
func (w Word) Duration() time.Duration {
	return w.End - w.Start
}

// Validate returns an error if the word is invalid.
func (w Word) Validate() error {
	if w.Text == "" {
		return fmt.Errorf("word text is required")
	}
	if w.Start < 0 {
		return fmt.Errorf("word start must be non-negative: %v", w.Start)
	}
	if w.End <= w.Start {
		return fmt.Errorf("word end (%v) must be after start (%v)", w.End, w.Start)
	}
	if w.Confidence != nil && (*w.Confidence < 0 || *w.Confidence > 1) {
		return fmt.Errorf("word confidence must be between 0 and 1: %v", *w.Confidence)
	}
	return nil
}
