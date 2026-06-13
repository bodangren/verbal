package db

import "fmt"

// RecordingStatus represents the transcription status of a recording.
type RecordingStatus string

const (
	StatusPending    RecordingStatus = "pending"
	StatusInProgress RecordingStatus = "in_progress"
	StatusCompleted  RecordingStatus = "completed"
	StatusError      RecordingStatus = "error"
)

// IsValid reports whether s is one of the four canonical recording statuses.
func (s RecordingStatus) IsValid() bool {
	switch s {
	case StatusPending, StatusInProgress, StatusCompleted, StatusError:
		return true
	default:
		return false
	}
}

// ValidRecordingStatuses returns a slice of all canonical recording statuses.
func ValidRecordingStatuses() []RecordingStatus {
	return []RecordingStatus{
		StatusPending,
		StatusInProgress,
		StatusCompleted,
		StatusError,
	}
}

// ValidateRecordingStatus returns an error if s is not a canonical recording status.
func ValidateRecordingStatus(s string) error {
	if !RecordingStatus(s).IsValid() {
		return fmt.Errorf("invalid recording status: %q", s)
	}
	return nil
}
