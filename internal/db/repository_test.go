package db

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}

func TestNewDatabase(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	if db.path != dbPath {
		t.Errorf("Expected path %s, got %s", dbPath, db.path)
	}
}

func TestNewDatabase_CreatesDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "subdir", "test.db")

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Error("Expected database file to be created")
	}
}

func TestRecordingRepository_Insert(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	rec := &Recording{
		FilePath:            "/path/to/recording.mp4",
		Duration:            120 * time.Second,
		TranscriptionStatus: "pending",
	}

	err = repo.Insert(rec)
	if err != nil {
		t.Fatalf("Insert() error = %v", err)
	}

	if rec.ID == 0 {
		t.Error("Expected ID to be set after insert")
	}
}

func TestRecordingRepository_GetByID(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	rec := &Recording{
		FilePath:            "/path/to/recording.mp4",
		Duration:            120 * time.Second,
		TranscriptionStatus: "pending",
	}

	if err := repo.Insert(rec); err != nil {
		t.Fatalf("Insert() error = %v", err)
	}

	got, err := repo.GetByID(rec.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}

	if got.FilePath != rec.FilePath {
		t.Errorf("Expected FilePath %s, got %s", rec.FilePath, got.FilePath)
	}
	if got.Duration != rec.Duration {
		t.Errorf("Expected Duration %v, got %v", rec.Duration, got.Duration)
	}
	if got.TranscriptionStatus != rec.TranscriptionStatus {
		t.Errorf("Expected TranscriptionStatus %s, got %s", rec.TranscriptionStatus, got.TranscriptionStatus)
	}
}

func TestRecordingRepository_GetByID_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	_, err = repo.GetByID(999)
	if err == nil {
		t.Error("Expected error for non-existent ID")
	}
}

func TestRecordingRepository_List(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	// Insert multiple recordings
	for i := 0; i < 3; i++ {
		rec := &Recording{
			FilePath:            "/path/to/recording%d.mp4",
			Duration:            time.Duration(i+1) * time.Minute,
			TranscriptionStatus: "pending",
		}
		if err := repo.Insert(rec); err != nil {
			t.Fatalf("Insert() error = %v", err)
		}
	}

	recordings, err := repo.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if len(recordings) != 3 {
		t.Errorf("Expected 3 recordings, got %d", len(recordings))
	}
}

func TestRecordingRepository_Update(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	rec := &Recording{
		FilePath:            "/path/to/recording.mp4",
		Duration:            120 * time.Second,
		TranscriptionStatus: "pending",
	}

	if err := repo.Insert(rec); err != nil {
		t.Fatalf("Insert() error = %v", err)
	}

	// Update the recording
	rec.TranscriptionStatus = "completed"
	rec.TranscriptionJSON = `{"words": [{"text": "hello", "start": 0, "end": 0.5}]}`

	if err := repo.Update(rec); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	got, err := repo.GetByID(rec.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}

	if got.TranscriptionStatus != "completed" {
		t.Errorf("Expected TranscriptionStatus 'completed', got %s", got.TranscriptionStatus)
	}
	if got.TranscriptionJSON == "" {
		t.Error("Expected TranscriptionJSON to be set")
	}
}

func TestRecordingRepository_Delete(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	rec := &Recording{
		FilePath:            "/path/to/recording.mp4",
		Duration:            120 * time.Second,
		TranscriptionStatus: "pending",
	}

	if err := repo.Insert(rec); err != nil {
		t.Fatalf("Insert() error = %v", err)
	}

	if err := repo.Delete(rec.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}

	_, err = repo.GetByID(rec.ID)
	if err == nil {
		t.Error("Expected error after deletion")
	}
}

func TestRecordingRepository_SearchByTranscription(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	// Insert recordings with different transcription content
	rec1 := &Recording{
		FilePath:            "/path/to/recording1.mp4",
		Duration:            60 * time.Second,
		TranscriptionStatus: "completed",
		TranscriptionJSON:   `{"words": [{"text": "hello world", "start": 0, "end": 1}]}`,
	}
	rec2 := &Recording{
		FilePath:            "/path/to/recording2.mp4",
		Duration:            90 * time.Second,
		TranscriptionStatus: "completed",
		TranscriptionJSON:   `{"words": [{"text": "goodbye world", "start": 0, "end": 1}]}`,
	}
	rec3 := &Recording{
		FilePath:            "/path/to/recording3.mp4",
		Duration:            30 * time.Second,
		TranscriptionStatus: "pending",
	}

	for _, rec := range []*Recording{rec1, rec2, rec3} {
		if err := repo.Insert(rec); err != nil {
			t.Fatalf("Insert() error = %v", err)
		}
	}

	// Search for "hello"
	results, err := repo.SearchByTranscription("hello")
	if err != nil {
		t.Fatalf("SearchByTranscription() error = %v", err)
	}

	if len(results) != 1 {
		t.Errorf("Expected 1 result for 'hello', got %d", len(results))
	}

	if len(results) > 0 && results[0].ID != rec1.ID {
		t.Errorf("Expected result ID %d, got %d", rec1.ID, results[0].ID)
	}
}

func TestRecordingRepository_ListOrderByCreatedAt(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.RecordingRepo()

	// Insert recordings in reverse order
	for i := 3; i >= 1; i-- {
		rec := &Recording{
			FilePath:            "/path/to/recording%d.mp4",
			Duration:            time.Duration(i) * time.Minute,
			TranscriptionStatus: "pending",
		}
		if err := repo.Insert(rec); err != nil {
			t.Fatalf("Insert() error = %v", err)
		}
	}

	recordings, err := repo.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	// Should be ordered by created_at DESC (newest first)
	if len(recordings) != 3 {
		t.Fatalf("Expected 3 recordings, got %d", len(recordings))
	}

	// IDs should be in descending order (newest first)
	if recordings[0].ID < recordings[1].ID || recordings[1].ID < recordings[2].ID {
		t.Error("Expected recordings ordered by created_at DESC")
	}
}
