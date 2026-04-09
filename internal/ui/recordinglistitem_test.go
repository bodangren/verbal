package ui

import (
	"testing"
	"time"

	"verbal/internal/db"
)

func TestRecordingListItem_New(t *testing.T) {
	rec := &db.Recording{
		ID:                  1,
		FilePath:            "/home/user/videos/interview.mp4",
		Duration:            120 * time.Second,
		TranscriptionStatus: "completed",
		CreatedAt:           time.Now(),
	}

	item := NewRecordingListItem(rec)
	if item == nil {
		t.Fatal("NewRecordingListItem() returned nil")
	}

	if item.GetRecording().ID != rec.ID {
		t.Error("Expected recording ID to match")
	}

	if item.Widget() == nil {
		t.Error("Expected Widget() to return non-nil")
	}
}

func TestRecordingListItem_FormatDuration(t *testing.T) {
	tests := []struct {
		duration time.Duration
		expected string
	}{
		{30 * time.Second, "0:30"},
		{60 * time.Second, "1:00"},
		{90 * time.Second, "1:30"},
		{123 * time.Second, "2:03"},
		{3600 * time.Second, "1:00:00"},
		{3661 * time.Second, "1:01:01"},
		{7200 * time.Second, "2:00:00"},
	}

	for _, tt := range tests {
		result := formatDuration(tt.duration)
		if result != tt.expected {
			t.Errorf("formatDuration(%v) = %s, expected %s", tt.duration, result, tt.expected)
		}
	}
}

func TestRecordingListItem_GetRecording(t *testing.T) {
	rec := &db.Recording{
		ID:                  42,
		FilePath:            "/path/to/video.mp4",
		Duration:            60 * time.Second,
		TranscriptionStatus: "pending",
	}

	item := NewRecordingListItem(rec)
	got := item.GetRecording()

	if got.ID != rec.ID {
		t.Errorf("Expected ID %d, got %d", rec.ID, got.ID)
	}
	if got.FilePath != rec.FilePath {
		t.Errorf("Expected FilePath %s, got %s", rec.FilePath, got.FilePath)
	}
}

func TestRecordingListItem_SetSelected(t *testing.T) {
	rec := &db.Recording{
		ID:                  1,
		FilePath:            "/home/user/video.mp4",
		Duration:            60 * time.Second,
		TranscriptionStatus: "completed",
	}

	item := NewRecordingListItem(rec)

	if item.IsSelected() {
		t.Error("Expected item to not be selected initially")
	}

	item.SetSelected(true)
	if !item.IsSelected() {
		t.Error("Expected item to be selected after SetSelected(true)")
	}

	item.SetSelected(false)
	if item.IsSelected() {
		t.Error("Expected item to not be selected after SetSelected(false)")
	}
}

func TestRecordingListItem_OnActivated(t *testing.T) {
	rec := &db.Recording{
		ID:                  1,
		FilePath:            "/home/user/video.mp4",
		Duration:            60 * time.Second,
		TranscriptionStatus: "completed",
	}

	item := NewRecordingListItem(rec)

	var activated bool
	item.OnActivated(func(r *db.Recording) {
		activated = true
		if r.ID != rec.ID {
			t.Errorf("Expected recording ID %d, got %d", rec.ID, r.ID)
		}
	})

	item.emitActivated()

	if !activated {
		t.Error("Expected OnActivated callback to be called")
	}
}

func TestRecordingListItem_OnDelete(t *testing.T) {
	rec := &db.Recording{
		ID:                  1,
		FilePath:            "/home/user/video.mp4",
		Duration:            60 * time.Second,
		TranscriptionStatus: "completed",
	}

	item := NewRecordingListItem(rec)

	var deleted bool
	item.OnDelete(func(r *db.Recording) {
		deleted = true
		if r.ID != rec.ID {
			t.Errorf("Expected recording ID %d, got %d", rec.ID, r.ID)
		}
	})

	item.emitDelete()

	if !deleted {
		t.Error("Expected OnDelete callback to be called")
	}
}

func TestRecordingListItem_UpdateThumbnailUpdatesModel(t *testing.T) {
	rec := &db.Recording{
		ID:                  3,
		FilePath:            "/home/user/video.mp4",
		Duration:            60 * time.Second,
		TranscriptionStatus: "completed",
	}

	item := NewRecordingListItem(rec)
	generatedAt := time.Now().UTC()
	item.UpdateThumbnail("invalid-base64", "image/jpeg", generatedAt)

	updated := item.GetRecording()
	if updated.ThumbnailData != "invalid-base64" {
		t.Errorf("Expected thumbnail data to be updated")
	}
	if updated.ThumbnailMIMEType != "image/jpeg" {
		t.Errorf("Expected thumbnail MIME type to be updated")
	}
	if updated.ThumbnailGeneratedAt == nil {
		t.Fatal("Expected ThumbnailGeneratedAt to be set")
	}
}
