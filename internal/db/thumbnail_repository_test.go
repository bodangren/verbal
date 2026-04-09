package db

import (
	"path/filepath"
	"testing"
	"time"
)

func TestThumbnailRepository_SaveAndGet(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	rec := &Recording{
		FilePath:            "/videos/clip.mp4",
		Duration:            10 * time.Second,
		TranscriptionStatus: "pending",
	}
	if err := database.RecordingRepo().Insert(rec); err != nil {
		t.Fatalf("Insert() error = %v", err)
	}

	repo := database.ThumbnailRepo()
	generatedAt := time.Now().UTC().Truncate(time.Second)

	if err := repo.SaveThumbnail(rec.ID, "YmFzZTY0LWpwZWc=", "image/jpeg", generatedAt); err != nil {
		t.Fatalf("SaveThumbnail() error = %v", err)
	}

	thumb, err := repo.GetThumbnail(rec.ID)
	if err != nil {
		t.Fatalf("GetThumbnail() error = %v", err)
	}
	if thumb == nil {
		t.Fatal("GetThumbnail() returned nil thumbnail")
	}
	if thumb.Data != "YmFzZTY0LWpwZWc=" {
		t.Errorf("Expected thumbnail data to round-trip")
	}
	if thumb.MIMEType != "image/jpeg" {
		t.Errorf("Expected MIME type image/jpeg, got %s", thumb.MIMEType)
	}
	if !thumb.GeneratedAt.Equal(generatedAt) {
		t.Errorf("Expected generated_at %v, got %v", generatedAt, thumb.GeneratedAt)
	}
}

func TestThumbnailRepository_GetThumbnail_NotGenerated(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	rec := &Recording{
		FilePath:            "/videos/no-thumb.mp4",
		Duration:            20 * time.Second,
		TranscriptionStatus: "pending",
	}
	if err := database.RecordingRepo().Insert(rec); err != nil {
		t.Fatalf("Insert() error = %v", err)
	}

	thumb, err := database.ThumbnailRepo().GetThumbnail(rec.ID)
	if err != nil {
		t.Fatalf("GetThumbnail() error = %v", err)
	}
	if thumb != nil {
		t.Fatalf("Expected nil thumbnail for recording without generated thumbnail")
	}
}

func TestThumbnailRepository_SaveThumbnail_RejectsEmptyPayload(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	rec := &Recording{
		FilePath:            "/videos/empty-thumb.mp4",
		Duration:            15 * time.Second,
		TranscriptionStatus: "pending",
	}
	if err := database.RecordingRepo().Insert(rec); err != nil {
		t.Fatalf("Insert() error = %v", err)
	}

	err = database.ThumbnailRepo().SaveThumbnail(rec.ID, "", "image/jpeg", time.Now().UTC())
	if err == nil {
		t.Fatal("Expected error when saving empty thumbnail payload")
	}
}

func TestRecordingRepository_ThumbnailFieldsRoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	generatedAt := time.Now().UTC().Truncate(time.Second)
	rec := &Recording{
		FilePath:             "/videos/with-thumb.mp4",
		Duration:             40 * time.Second,
		TranscriptionStatus:  "pending",
		ThumbnailData:        "YmFzZTY0",
		ThumbnailMIMEType:    "image/jpeg",
		ThumbnailGeneratedAt: &generatedAt,
	}

	if err := database.RecordingRepo().Insert(rec); err != nil {
		t.Fatalf("Insert() error = %v", err)
	}

	got, err := database.RecordingRepo().GetByID(rec.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.ThumbnailData != rec.ThumbnailData {
		t.Errorf("Expected thumbnail data %q, got %q", rec.ThumbnailData, got.ThumbnailData)
	}
	if got.ThumbnailMIMEType != rec.ThumbnailMIMEType {
		t.Errorf("Expected MIME type %q, got %q", rec.ThumbnailMIMEType, got.ThumbnailMIMEType)
	}
	if got.ThumbnailGeneratedAt == nil {
		t.Fatal("Expected ThumbnailGeneratedAt to be non-nil")
	}
	if !got.ThumbnailGeneratedAt.Equal(generatedAt) {
		t.Errorf("Expected generated_at %v, got %v", generatedAt, *got.ThumbnailGeneratedAt)
	}
}
