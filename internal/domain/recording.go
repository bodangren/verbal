package domain

import (
	"fmt"
	"time"
)

// TranscriptionStatus enumerates the possible transcription states.
type TranscriptionStatus string

const (
	// StatusPending indicates the recording has not been transcribed yet.
	StatusPending TranscriptionStatus = "pending"
	// StatusInProgress indicates transcription is currently running.
	StatusInProgress TranscriptionStatus = "in_progress"
	// StatusCompleted indicates transcription finished successfully.
	StatusCompleted TranscriptionStatus = "completed"
	// StatusError indicates transcription failed.
	StatusError TranscriptionStatus = "error"
)

// Recording represents a video/audio recording in the library.
type Recording struct {
	ID                  int64
	Title               string
	FilePath            string
	Duration            time.Duration
	TranscriptionStatus TranscriptionStatus
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// NewRecording creates a validated Recording.
func NewRecording(title, filePath string, duration time.Duration) (Recording, error) {
	r := Recording{
		Title:               title,
		FilePath:            filePath,
		Duration:            duration,
		TranscriptionStatus: StatusPending,
	}
	if err := r.Validate(); err != nil {
		return Recording{}, err
	}
	return r, nil
}

// SetTranscriptionStatus updates the transcription status and updated-at time.
func (r *Recording) SetTranscriptionStatus(status TranscriptionStatus) error {
	switch status {
	case StatusPending, StatusInProgress, StatusCompleted, StatusError:
		r.TranscriptionStatus = status
		r.UpdatedAt = time.Now()
		return nil
	default:
		return fmt.Errorf("invalid transcription status: %q", status)
	}
}

// Validate returns an error if the recording is invalid.
func (r Recording) Validate() error {
	if r.FilePath == "" {
		return fmt.Errorf("recording file path is required")
	}
	if r.Duration < 0 {
		return fmt.Errorf("recording duration must be non-negative: %v", r.Duration)
	}
	return nil
}
