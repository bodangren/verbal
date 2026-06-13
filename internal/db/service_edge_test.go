package db

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

func TestRecordingService_GetRecent(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Empty database
	recent, err := svc.GetRecent(5)
	if err != nil {
		t.Fatalf("GetRecent() error = %v", err)
	}
	if len(recent) != 0 {
		t.Errorf("expected 0 recent recordings, got %d", len(recent))
	}

	// Add recordings
	for i := 0; i < 5; i++ {
		path := filepath.Join("/tmp", fmt.Sprintf("rec%d.mp4", i))
		if _, err := svc.AddRecording(path, time.Duration(i+1)*time.Minute); err != nil {
			t.Fatalf("AddRecording() error = %v", err)
		}
	}

	recent, err = svc.GetRecent(3)
	if err != nil {
		t.Fatalf("GetRecent() error = %v", err)
	}
	if len(recent) != 3 {
		t.Errorf("expected 3 recent recordings, got %d", len(recent))
	}

	// Limit larger than count
	recent, err = svc.GetRecent(10)
	if err != nil {
		t.Fatalf("GetRecent() error = %v", err)
	}
	if len(recent) != 5 {
		t.Errorf("expected 5 recent recordings, got %d", len(recent))
	}
}

func TestRecordingService_AddRecording_InsertError(t *testing.T) {
	// Simulate insert error by closing database before adding.
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	database.Close()

	svc := NewRecordingService(database)
	_, err = svc.AddRecording("/tmp/test.mp4", time.Minute)
	if err == nil {
		t.Fatal("expected error when adding recording to closed database")
	}
}
