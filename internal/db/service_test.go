package db

import (
	"path/filepath"
	"testing"
	"time"
)

func TestRecordingService_GetLibrary(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Initially empty
	recordings, err := svc.GetLibrary()
	if err != nil {
		t.Fatalf("GetLibrary() error = %v", err)
	}
	if len(recordings) != 0 {
		t.Errorf("Expected 0 recordings, got %d", len(recordings))
	}

	// Add some recordings
	for i := 0; i < 5; i++ {
		rec := &Recording{
			FilePath:            filepath.Join("/path", "to", "recording%d.mp4"),
			Duration:            time.Duration(i+1) * time.Minute,
			TranscriptionStatus: "pending",
		}
		if err := database.RecordingRepo().Insert(rec); err != nil {
			t.Fatalf("Insert() error = %v", err)
		}
	}

	// Get library
	recordings, err = svc.GetLibrary()
	if err != nil {
		t.Fatalf("GetLibrary() error = %v", err)
	}
	if len(recordings) != 5 {
		t.Errorf("Expected 5 recordings, got %d", len(recordings))
	}
}

func TestRecordingService_Search(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Add recordings
	recs := []*Recording{
		{FilePath: "/home/user/videos/interview.mp4", Duration: 60 * time.Second, TranscriptionStatus: "completed", TranscriptionJSON: `{"text": "interview about golang"}`},
		{FilePath: "/home/user/videos/podcast.mp4", Duration: 90 * time.Second, TranscriptionStatus: "completed", TranscriptionJSON: `{"text": "tech podcast episode"}`},
		{FilePath: "/home/user/meeting.mp4", Duration: 30 * time.Second, TranscriptionStatus: "pending"},
	}

	for _, rec := range recs {
		if err := database.RecordingRepo().Insert(rec); err != nil {
			t.Fatalf("Insert() error = %v", err)
		}
	}

	// Search by path
	results, err := svc.Search("interview")
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if len(results) != 1 {
		t.Errorf("Expected 1 result for 'interview', got %d", len(results))
	}

	// Search by transcription
	results, err = svc.Search("podcast")
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if len(results) != 1 {
		t.Errorf("Expected 1 result for 'podcast', got %d", len(results))
	}

	// Search with no matches
	results, err = svc.Search("nonexistent")
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if len(results) != 0 {
		t.Errorf("Expected 0 results for 'nonexistent', got %d", len(results))
	}
}

func TestRecordingService_AddRecording(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Add new recording
	rec, err := svc.AddRecording("/path/to/recording.mp4", 120*time.Second)
	if err != nil {
		t.Fatalf("AddRecording() error = %v", err)
	}

	if rec.ID == 0 {
		t.Error("Expected ID to be set")
	}
	if rec.FilePath != "/path/to/recording.mp4" {
		t.Errorf("Expected FilePath '/path/to/recording.mp4', got %s", rec.FilePath)
	}
	if rec.Duration != 120*time.Second {
		t.Errorf("Expected Duration 120s, got %v", rec.Duration)
	}
	if rec.TranscriptionStatus != "pending" {
		t.Errorf("Expected TranscriptionStatus 'pending', got %s", rec.TranscriptionStatus)
	}

	// Verify it was added to database
	got, err := database.RecordingRepo().GetByID(rec.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.FilePath != rec.FilePath {
		t.Errorf("Expected FilePath %s, got %s", rec.FilePath, got.FilePath)
	}
}

func TestRecordingService_AddRecording_UpdateExisting(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Add initial recording
	rec1, err := svc.AddRecording("/path/to/recording.mp4", 120*time.Second)
	if err != nil {
		t.Fatalf("AddRecording() error = %v", err)
	}

	// Add same file again (should update)
	rec2, err := svc.AddRecording("/path/to/recording.mp4", 180*time.Second)
	if err != nil {
		t.Fatalf("AddRecording() error = %v", err)
	}

	// Should be the same ID
	if rec1.ID != rec2.ID {
		t.Errorf("Expected same ID %d, got %d", rec1.ID, rec2.ID)
	}

	// Duration should be updated
	if rec2.Duration != 180*time.Second {
		t.Errorf("Expected Duration 180s, got %v", rec2.Duration)
	}

	// Verify only one record in database
	all, err := database.RecordingRepo().List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(all) != 1 {
		t.Errorf("Expected 1 recording, got %d", len(all))
	}
}

func TestRecordingService_UpdateTranscription(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Add recording
	rec, err := svc.AddRecording("/path/to/recording.mp4", 120*time.Second)
	if err != nil {
		t.Fatalf("AddRecording() error = %v", err)
	}

	// Update transcription
	jsonData := `{"words": [{"text": "hello", "start": 0, "end": 0.5}]}`
	err = svc.UpdateTranscription(rec.ID, jsonData)
	if err != nil {
		t.Fatalf("UpdateTranscription() error = %v", err)
	}

	// Verify update
	got, err := database.RecordingRepo().GetByID(rec.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.TranscriptionStatus != "completed" {
		t.Errorf("Expected TranscriptionStatus 'completed', got %s", got.TranscriptionStatus)
	}
	if got.TranscriptionJSON != jsonData {
		t.Errorf("Expected TranscriptionJSON %s, got %s", jsonData, got.TranscriptionJSON)
	}
}

func TestRecordingService_UpdateTranscription_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Try to update non-existent recording
	err = svc.UpdateTranscription(999, `{"text": "test"}`)
	if err == nil {
		t.Error("Expected error for non-existent recording")
	}
}

func TestRecordingService_GetByID(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Add recording
	rec, err := svc.AddRecording("/path/to/recording.mp4", 120*time.Second)
	if err != nil {
		t.Fatalf("AddRecording() error = %v", err)
	}

	// Get by ID
	got, err := svc.GetByID(rec.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.ID != rec.ID {
		t.Errorf("Expected ID %d, got %d", rec.ID, got.ID)
	}
	if got.FilePath != rec.FilePath {
		t.Errorf("Expected FilePath %s, got %s", rec.FilePath, got.FilePath)
	}
}

func TestRecordingService_GetByID_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Try to get non-existent recording
	_, err = svc.GetByID(999)
	if err == nil {
		t.Error("Expected error for non-existent recording")
	}
}

func TestRecordingService_Delete(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer database.Close()

	svc := NewRecordingService(database)

	// Add recording
	rec, err := svc.AddRecording("/path/to/recording.mp4", 120*time.Second)
	if err != nil {
		t.Fatalf("AddRecording() error = %v", err)
	}

	// Delete it
	err = svc.Delete(rec.ID)
	if err != nil {
		t.Fatalf("Delete() error = %v", err)
	}

	// Verify it's gone
	_, err = svc.GetByID(rec.ID)
	if err == nil {
		t.Error("Expected error after deletion")
	}
}
