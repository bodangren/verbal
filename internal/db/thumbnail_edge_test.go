package db

import (
	"path/filepath"
	"testing"
	"time"
)

func TestThumbnailRepository_SaveAndGet_Edge(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.ThumbnailRepo()

	// Save thumbnail for non-existent recording should not error but not create row.
	if err := repo.SaveThumbnail(1, "base64data", "image/png", time.Now()); err != nil {
		t.Fatalf("SaveThumbnail() error = %v", err)
	}

	// Insert a recording
	svc := NewRecordingService(db)
	rec, err := svc.AddRecording("/tmp/test.mp4", time.Minute)
	if err != nil {
		t.Fatalf("AddRecording() error = %v", err)
	}

	generatedAt := time.Now().UTC().Truncate(time.Second)
	if err := repo.SaveThumbnail(rec.ID, "base64data", "image/png", generatedAt); err != nil {
		t.Fatalf("SaveThumbnail() error = %v", err)
	}

	thumb, err := repo.GetThumbnail(rec.ID)
	if err != nil {
		t.Fatalf("GetThumbnail() error = %v", err)
	}
	if thumb == nil {
		t.Fatal("expected thumbnail, got nil")
	}
	if thumb.Data != "base64data" {
		t.Errorf("Data = %q, want %q", thumb.Data, "base64data")
	}
	if thumb.MIMEType != "image/png" {
		t.Errorf("MIMEType = %q, want %q", thumb.MIMEType, "image/png")
	}
}

func TestThumbnailRepository_SaveThumbnail_Validation(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.ThumbnailRepo()

	if err := repo.SaveThumbnail(0, "data", "image/png", time.Now()); err == nil {
		t.Error("expected error for zero recording id")
	}
	if err := repo.SaveThumbnail(1, "", "image/png", time.Now()); err == nil {
		t.Error("expected error for empty data")
	}
	if err := repo.SaveThumbnail(1, "   ", "image/png", time.Now()); err == nil {
		t.Error("expected error for whitespace-only data")
	}
}

func TestThumbnailRepository_GetThumbnail_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.ThumbnailRepo()

	thumb, err := repo.GetThumbnail(999)
	if err != nil {
		t.Fatalf("GetThumbnail() error = %v", err)
	}
	if thumb != nil {
		t.Errorf("expected nil thumbnail, got %+v", thumb)
	}
}

func TestThumbnailRepository_GetThumbnail_EmptyData(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	svc := NewRecordingService(db)
	rec, err := svc.AddRecording("/tmp/test.mp4", time.Minute)
	if err != nil {
		t.Fatalf("AddRecording() error = %v", err)
	}

	repo := db.ThumbnailRepo()
	thumb, err := repo.GetThumbnail(rec.ID)
	if err != nil {
		t.Fatalf("GetThumbnail() error = %v", err)
	}
	if thumb != nil {
		t.Errorf("expected nil thumbnail for empty data, got %+v", thumb)
	}
}
