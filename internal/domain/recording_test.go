package domain

import (
	"strings"
	"testing"
	"time"
)

func TestNewRecording(t *testing.T) {
	tests := []struct {
		name        string
		title       string
		filePath    string
		duration    time.Duration
		wantErr     bool
		errContains string
	}{
		{
			name:     "valid recording",
			title:    "Interview",
			filePath: "/media/interview.mp4",
			duration: 5 * time.Minute,
			wantErr:  false,
		},
		{
			name:        "missing file path",
			title:       "Interview",
			filePath:    "",
			duration:    5 * time.Minute,
			wantErr:     true,
			errContains: "file path is required",
		},
		{
			name:        "negative duration",
			title:       "Interview",
			filePath:    "/media/interview.mp4",
			duration:    -1 * time.Second,
			wantErr:     true,
			errContains: "duration must be non-negative",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, err := NewRecording(tt.title, tt.filePath, tt.duration)
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
			if r.Title != tt.title {
				t.Errorf("Title = %q, want %q", r.Title, tt.title)
			}
			if r.FilePath != tt.filePath {
				t.Errorf("FilePath = %q, want %q", r.FilePath, tt.filePath)
			}
			if r.Duration != tt.duration {
				t.Errorf("Duration = %v, want %v", r.Duration, tt.duration)
			}
			if r.TranscriptionStatus != StatusPending {
				t.Errorf("TranscriptionStatus = %q, want %q", r.TranscriptionStatus, StatusPending)
			}
		})
	}
}

func TestRecordingSetTranscriptionStatus(t *testing.T) {
	r, err := NewRecording("Test", "/tmp/test.mp4", time.Minute)
	if err != nil {
		t.Fatalf("failed to create recording: %v", err)
	}

	before := r.UpdatedAt
	time.Sleep(10 * time.Millisecond)

	if err := r.SetTranscriptionStatus(StatusCompleted); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.TranscriptionStatus != StatusCompleted {
		t.Errorf("TranscriptionStatus = %q, want %q", r.TranscriptionStatus, StatusCompleted)
	}
	if !r.UpdatedAt.After(before) {
		t.Errorf("UpdatedAt was not updated")
	}

	if err := r.SetTranscriptionStatus("invalid"); err == nil {
		t.Fatal("expected error for invalid status")
	}
}
