package domain

import (
	"fmt"
	"time"
)

// Segment is a time range derived from selected words for export.
type Segment struct {
	Start time.Duration
	End   time.Duration
}

// NewSegment creates a validated Segment.
func NewSegment(start, end time.Duration) (Segment, error) {
	s := Segment{Start: start, End: end}
	if err := s.Validate(); err != nil {
		return Segment{}, err
	}
	return s, nil
}

// SegmentFromWords creates a Segment spanning the provided words.
// It returns an error if no words are provided or if the words are not ordered.
func SegmentFromWords(words []Word) (Segment, error) {
	if len(words) == 0 {
		return Segment{}, fmt.Errorf("segment requires at least one word")
	}
	for i := 1; i < len(words); i++ {
		if words[i].Start < words[i-1].Start {
			return Segment{}, fmt.Errorf("words must be ordered by start time")
		}
	}
	start := words[0].Start
	end := words[len(words)-1].End
	if end <= start {
		return Segment{}, fmt.Errorf("segment end must be after start")
	}
	return Segment{Start: start, End: end}, nil
}

// Duration returns the segment's elapsed time.
func (s Segment) Duration() time.Duration {
	return s.End - s.Start
}

// Validate returns an error if the segment is invalid.
func (s Segment) Validate() error {
	if s.Start < 0 {
		return fmt.Errorf("segment start must be non-negative: %v", s.Start)
	}
	if s.End <= s.Start {
		return fmt.Errorf("segment end (%v) must be after start (%v)", s.End, s.Start)
	}
	return nil
}
