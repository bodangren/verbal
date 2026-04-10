package lifecycle

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"verbal/internal/db"
)

// mockThumbnailGenerator is a test helper for thumbnail generation
type mockThumbnailGenerator struct {
	shouldFail bool
}

func (m *mockThumbnailGenerator) Generate(videoPath string) ([]byte, string, error) {
	if m.shouldFail {
		return nil, "", os.ErrInvalid
	}
	return []byte("fake-thumbnail-data"), "image/jpeg", nil
}

func TestDatabaseInspector_CheckOrphanedRecordings(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	inspector := NewDatabaseInspector(database.RecordingRepo())

	// Create a media file that exists
	existingFile := filepath.Join(tmpDir, "existing.mp4")
	if err := os.WriteFile(existingFile, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	// Create a media file path that doesn't exist
	missingFile := filepath.Join(tmpDir, "missing.mp4")

	// Insert recordings
	repo := database.RecordingRepo()

	// Recording with existing file
	rec1 := &db.Recording{
		FilePath:            existingFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
	}
	if err := repo.Insert(rec1); err != nil {
		t.Fatalf("failed to insert recording 1: %v", err)
	}

	// Recording with missing file
	rec2 := &db.Recording{
		FilePath:            missingFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
	}
	if err := repo.Insert(rec2); err != nil {
		t.Fatalf("failed to insert recording 2: %v", err)
	}

	// Check for orphaned recordings
	orphaned, err := inspector.CheckOrphanedRecordings()
	if err != nil {
		t.Fatalf("CheckOrphanedRecordings failed: %v", err)
	}

	if len(orphaned) != 1 {
		t.Errorf("expected 1 orphaned recording, got %d", len(orphaned))
	}

	if len(orphaned) > 0 && orphaned[0].ID != rec2.ID {
		t.Errorf("expected orphaned recording ID %d, got %d", rec2.ID, orphaned[0].ID)
	}
}

func TestDatabaseInspector_CheckMissingThumbnails(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	inspector := NewDatabaseInspector(database.RecordingRepo())

	// Create a media file
	mediaFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(mediaFile, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	repo := database.RecordingRepo()

	// Recording without thumbnail
	rec1 := &db.Recording{
		FilePath:            mediaFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
		ThumbnailData:       "",
	}
	if err := repo.Insert(rec1); err != nil {
		t.Fatalf("failed to insert recording 1: %v", err)
	}

	// Recording with thumbnail
	rec2 := &db.Recording{
		FilePath:            mediaFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
		ThumbnailData:       "base64data",
		ThumbnailMIMEType:   "image/jpeg",
	}
	if err := repo.Insert(rec2); err != nil {
		t.Fatalf("failed to insert recording 2: %v", err)
	}

	// Check for missing thumbnails
	missingThumbs, err := inspector.CheckMissingThumbnails()
	if err != nil {
		t.Fatalf("CheckMissingThumbnails failed: %v", err)
	}

	if len(missingThumbs) != 1 {
		t.Errorf("expected 1 recording with missing thumbnail, got %d", len(missingThumbs))
	}

	if len(missingThumbs) > 0 && missingThumbs[0].ID != rec1.ID {
		t.Errorf("expected recording ID %d, got %d", rec1.ID, missingThumbs[0].ID)
	}
}

func TestDatabaseInspector_CheckInvalidTranscriptions(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	inspector := NewDatabaseInspector(database.RecordingRepo())

	// Create a media file
	mediaFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(mediaFile, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	repo := database.RecordingRepo()

	// Recording with valid transcription JSON
	validTranscription := map[string]interface{}{
		"words": []map[string]interface{}{
			{"word": "hello", "start": 0.0, "end": 0.5},
		},
	}
	validJSON, _ := json.Marshal(validTranscription)

	rec1 := &db.Recording{
		FilePath:            mediaFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
		TranscriptionJSON:   string(validJSON),
	}
	if err := repo.Insert(rec1); err != nil {
		t.Fatalf("failed to insert recording 1: %v", err)
	}

	// Recording with invalid transcription JSON
	rec2 := &db.Recording{
		FilePath:            mediaFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
		TranscriptionJSON:   "invalid json {",
	}
	if err := repo.Insert(rec2); err != nil {
		t.Fatalf("failed to insert recording 2: %v", err)
	}

	// Recording with empty transcription (should be skipped - not invalid, just pending)
	rec3 := &db.Recording{
		FilePath:            mediaFile,
		Duration:            time.Minute,
		TranscriptionStatus: "pending",
		TranscriptionJSON:   "",
	}
	if err := repo.Insert(rec3); err != nil {
		t.Fatalf("failed to insert recording 3: %v", err)
	}

	// Check for invalid transcriptions
	invalidTranscriptions, err := inspector.CheckInvalidTranscriptions()
	if err != nil {
		t.Fatalf("CheckInvalidTranscriptions failed: %v", err)
	}

	if len(invalidTranscriptions) != 1 {
		t.Errorf("expected 1 recording with invalid transcription, got %d", len(invalidTranscriptions))
	}

	if len(invalidTranscriptions) > 0 && invalidTranscriptions[0].ID != rec2.ID {
		t.Errorf("expected recording ID %d, got %d", rec2.ID, invalidTranscriptions[0].ID)
	}
}

func TestDatabaseInspector_RunAllChecks(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	inspector := NewDatabaseInspector(database.RecordingRepo())

	// Create media files
	existingFile := filepath.Join(tmpDir, "existing.mp4")
	if err := os.WriteFile(existingFile, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	missingFile := filepath.Join(tmpDir, "missing.mp4")

	repo := database.RecordingRepo()

	// Recording with all issues: orphaned, no thumbnail, invalid transcription
	rec1 := &db.Recording{
		FilePath:            missingFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
		TranscriptionJSON:   "invalid json",
	}
	if err := repo.Insert(rec1); err != nil {
		t.Fatalf("failed to insert recording 1: %v", err)
	}

	// Healthy recording
	validTranscription := map[string]interface{}{
		"words": []map[string]interface{}{
			{"word": "hello", "start": 0.0, "end": 0.5},
		},
	}
	validJSON, _ := json.Marshal(validTranscription)

	rec2 := &db.Recording{
		FilePath:            existingFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
		TranscriptionJSON:   string(validJSON),
		ThumbnailData:       "base64data",
		ThumbnailMIMEType:   "image/jpeg",
	}
	if err := repo.Insert(rec2); err != nil {
		t.Fatalf("failed to insert recording 2: %v", err)
	}

	// Run all checks
	report, err := inspector.RunAllChecks()
	if err != nil {
		t.Fatalf("RunAllChecks failed: %v", err)
	}

	if report.TotalIssues != 3 {
		t.Errorf("expected 3 total issues, got %d", report.TotalIssues)
	}

	if len(report.OrphanedRecordings) != 1 {
		t.Errorf("expected 1 orphaned recording, got %d", len(report.OrphanedRecordings))
	}

	if len(report.MissingThumbnails) != 1 { // only rec1 is missing thumbnail (rec2 has thumbnail_data)
		t.Errorf("expected 1 recording with missing thumbnail, got %d", len(report.MissingThumbnails))
	}

	if len(report.InvalidTranscriptions) != 1 {
		t.Errorf("expected 1 invalid transcription, got %d", len(report.InvalidTranscriptions))
	}
}

func TestDatabaseInspector_EmptyDatabase(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	inspector := NewDatabaseInspector(database.RecordingRepo())

	// Run all checks on empty database
	report, err := inspector.RunAllChecks()
	if err != nil {
		t.Fatalf("RunAllChecks failed: %v", err)
	}

	if report.TotalIssues != 0 {
		t.Errorf("expected 0 issues for empty database, got %d", report.TotalIssues)
	}
}
