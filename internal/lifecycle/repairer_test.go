package lifecycle

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
	"time"

	"verbal/internal/db"
)

func TestDatabaseRepairer_RemoveOrphanedEntry(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()

	// Create a recording with missing file
	missingFile := filepath.Join(tmpDir, "missing.mp4")
	rec := &db.Recording{
		FilePath:            missingFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
	}
	if err := repo.Insert(rec); err != nil {
		t.Fatalf("failed to insert recording: %v", err)
	}

	// Verify recording exists
	_, err = repo.GetByID(rec.ID)
	if err != nil {
		t.Fatalf("recording should exist before removal: %v", err)
	}

	// Remove the orphaned entry
	repairer := NewDatabaseRepairer(repo, nil)
	if err := repairer.RemoveOrphanedEntry(rec.ID); err != nil {
		t.Fatalf("RemoveOrphanedEntry failed: %v", err)
	}

	// Verify recording no longer exists
	_, err = repo.GetByID(rec.ID)
	if err == nil {
		t.Error("recording should not exist after removal")
	}
}

func TestDatabaseRepairer_RemoveOrphanedEntry_NonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()
	repairer := NewDatabaseRepairer(repo, nil)

	// Try to remove non-existent recording
	err = repairer.RemoveOrphanedEntry(99999)
	if err == nil {
		t.Error("expected error when removing non-existent recording")
	}
}

func TestDatabaseRepairer_MarkAsUnavailable(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()

	// Create a recording
	mediaFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(mediaFile, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	rec := &db.Recording{
		FilePath:            mediaFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
	}
	if err := repo.Insert(rec); err != nil {
		t.Fatalf("failed to insert recording: %v", err)
	}

	// Mark as unavailable
	repairer := NewDatabaseRepairer(repo, nil)
	if err := repairer.MarkAsUnavailable(rec.ID); err != nil {
		t.Fatalf("MarkAsUnavailable failed: %v", err)
	}

	// Verify transcription status changed to "unavailable"
	updatedRec, err := repo.GetByID(rec.ID)
	if err != nil {
		t.Fatalf("failed to get updated recording: %v", err)
	}

	if updatedRec.TranscriptionStatus != "unavailable" {
		t.Errorf("expected status 'unavailable', got '%s'", updatedRec.TranscriptionStatus)
	}
}

func TestDatabaseRepairer_MarkAsUnavailable_NonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()
	repairer := NewDatabaseRepairer(repo, nil)

	// Try to mark non-existent recording
	err = repairer.MarkAsUnavailable(99999)
	if err == nil {
		t.Error("expected error when marking non-existent recording")
	}
}

func TestDatabaseRepairer_RegenerateThumbnail(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()

	// Create a media file
	mediaFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(mediaFile, []byte("test video content"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	rec := &db.Recording{
		FilePath:            mediaFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
	}
	if err := repo.Insert(rec); err != nil {
		t.Fatalf("failed to insert recording: %v", err)
	}

	// Create mock thumbnail generator
	mockGenerator := &mockThumbnailGenerator{}

	// Regenerate thumbnail
	repairer := NewDatabaseRepairer(repo, mockGenerator)
	if err := repairer.RegenerateThumbnail(rec.ID, mediaFile); err != nil {
		t.Fatalf("RegenerateThumbnail failed: %v", err)
	}

	// Verify thumbnail was saved
	updatedRec, err := repo.GetByID(rec.ID)
	if err != nil {
		t.Fatalf("failed to get updated recording: %v", err)
	}

	if updatedRec.ThumbnailData == "" {
		t.Error("expected thumbnail data to be set")
	}

	expectedData := base64.StdEncoding.EncodeToString([]byte("fake-thumbnail-data"))
	if updatedRec.ThumbnailData != expectedData {
		t.Errorf("expected thumbnail data '%s', got '%s'", expectedData, updatedRec.ThumbnailData)
	}

	if updatedRec.ThumbnailMIMEType != "image/jpeg" {
		t.Errorf("expected mime type 'image/jpeg', got '%s'", updatedRec.ThumbnailMIMEType)
	}

	if updatedRec.ThumbnailGeneratedAt == nil {
		t.Error("expected thumbnail generated at to be set")
	}
}

func TestDatabaseRepairer_RegenerateThumbnail_GeneratorFailure(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()

	// Create a media file
	mediaFile := filepath.Join(tmpDir, "test.mp4")
	if err := os.WriteFile(mediaFile, []byte("test video content"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	rec := &db.Recording{
		FilePath:            mediaFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
	}
	if err := repo.Insert(rec); err != nil {
		t.Fatalf("failed to insert recording: %v", err)
	}

	// Create failing mock thumbnail generator
	mockGenerator := &mockThumbnailGenerator{shouldFail: true}

	// Try to regenerate thumbnail
	repairer := NewDatabaseRepairer(repo, mockGenerator)
	err = repairer.RegenerateThumbnail(rec.ID, mediaFile)
	if err == nil {
		t.Error("expected error when thumbnail generation fails")
	}
}

func TestDatabaseRepairer_RegenerateThumbnail_NonExistentRecording(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()
	mockGenerator := &mockThumbnailGenerator{}

	repairer := NewDatabaseRepairer(repo, mockGenerator)

	// Try to regenerate thumbnail for non-existent recording
	mediaFile := filepath.Join(tmpDir, "test.mp4")
	err = repairer.RegenerateThumbnail(99999, mediaFile)
	if err == nil {
		t.Error("expected error when regenerating thumbnail for non-existent recording")
	}
}

func TestDatabaseRepairer_RepairAll(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()

	// Create an existing file for one recording
	existingFile := filepath.Join(tmpDir, "existing.mp4")
	if err := os.WriteFile(existingFile, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	// Create a recording with missing file (orphaned)
	missingFile := filepath.Join(tmpDir, "missing.mp4")
	orphanedRec := &db.Recording{
		FilePath:            missingFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
	}
	if err := repo.Insert(orphanedRec); err != nil {
		t.Fatalf("failed to insert orphaned recording: %v", err)
	}

	// Create a recording with existing file but no thumbnail
	recWithThumb := &db.Recording{
		FilePath:            existingFile,
		Duration:            time.Minute,
		TranscriptionStatus: "completed",
	}
	if err := repo.Insert(recWithThumb); err != nil {
		t.Fatalf("failed to insert recording without thumbnail: %v", err)
	}

	// Create inspector and repairer
	inspector := NewDatabaseInspector(repo)
	mockGenerator := &mockThumbnailGenerator{}
	repairer := NewDatabaseRepairer(repo, mockGenerator)

	// Run inspection
	inspectionReport, err := inspector.RunAllChecks()
	if err != nil {
		t.Fatalf("inspection failed: %v", err)
	}

	// Repair all issues
	repairReport, err := repairer.RepairAll(inspectionReport)
	if err != nil {
		t.Fatalf("RepairAll failed: %v", err)
	}

	// Verify repair report
	if repairReport.TotalRepairs != 2 {
		t.Errorf("expected 2 repairs, got %d", repairReport.TotalRepairs)
	}

	if len(repairReport.RemovedOrphans) != 1 {
		t.Errorf("expected 1 removed orphan, got %d", len(repairReport.RemovedOrphans))
	}

	if len(repairReport.RegeneratedThumbnails) != 1 {
		t.Errorf("expected 1 regenerated thumbnail, got %d", len(repairReport.RegeneratedThumbnails))
	}

	// Verify orphaned recording was removed
	_, err = repo.GetByID(orphanedRec.ID)
	if err == nil {
		t.Error("orphaned recording should have been removed")
	}

	// Verify thumbnail was generated
	updatedRec, _ := repo.GetByID(recWithThumb.ID)
	if updatedRec != nil && updatedRec.ThumbnailData == "" {
		t.Error("thumbnail should have been generated")
	}
}

func TestDatabaseRepairer_RepairAll_NoIssues(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	repo := database.RecordingRepo()
	mockGenerator := &mockThumbnailGenerator{}
	repairer := NewDatabaseRepairer(repo, mockGenerator)

	// Run repair on empty inspection report
	emptyReport := &InspectionReport{}
	repairReport, err := repairer.RepairAll(emptyReport)
	if err != nil {
		t.Fatalf("RepairAll failed: %v", err)
	}

	if repairReport.TotalRepairs != 0 {
		t.Errorf("expected 0 repairs, got %d", repairReport.TotalRepairs)
	}
}
