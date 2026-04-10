package lifecycle

import (
	"archive/zip"
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func createTestArchive(t *testing.T, dir string, manifest *ExportManifest, files map[string][]byte) string {
	archivePath := filepath.Join(dir, "test-export.zip")

	zipFile, err := os.Create(archivePath)
	if err != nil {
		t.Fatalf("failed to create archive: %v", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// Add manifest
	manifestData, err := manifest.Serialize()
	if err != nil {
		t.Fatalf("failed to serialize manifest: %v", err)
	}

	manifestWriter, err := zipWriter.Create("manifest.json")
	if err != nil {
		t.Fatalf("failed to create manifest: %v", err)
	}
	if _, err := manifestWriter.Write(manifestData); err != nil {
		t.Fatalf("failed to write manifest: %v", err)
	}

	// Add files
	for name, data := range files {
		writer, err := zipWriter.Create(name)
		if err != nil {
			t.Fatalf("failed to create %s: %v", name, err)
		}
		if _, err := writer.Write(data); err != nil {
			t.Fatalf("failed to write %s: %v", name, err)
		}
	}

	return archivePath
}

func TestArchiveImporter_Import(t *testing.T) {
	tempDir := t.TempDir()

	// Create test data
	mediaData := []byte("fake video content")
	transData := []byte(`{"words": [{"text": "hello", "start": 0, "end": 500}]}`)
	thumbData := []byte("fake thumbnail")

	mediaChecksum := CalculateChecksum(mediaData)
	transChecksum := CalculateChecksum(transData)
	thumbChecksum := CalculateChecksum(thumbData)

	manifest := NewExportManifest(&ExportedRecording{
		ID:          "rec-123",
		Title:       "Test Recording",
		Description: "A test",
		CreatedAt:   time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC),
		Duration:    60000,
		MediaFile: &ExportedFile{
			Filename: "video.mp4",
			Size:     int64(len(mediaData)),
			Checksum: mediaChecksum,
		},
		Transcription: &ExportedFile{
			Filename: "transcript.json",
			Size:     int64(len(transData)),
			Checksum: transChecksum,
		},
		Thumbnail: &ExportedFile{
			Filename: "thumb.jpg",
			Size:     int64(len(thumbData)),
			Checksum: thumbChecksum,
		},
	})

	files := map[string][]byte{
		"media/video.mp4":               mediaData,
		"transcription/transcript.json": transData,
		"thumbnail/thumb.jpg":           thumbData,
	}

	archivePath := createTestArchive(t, tempDir, manifest, files)

	// Setup mocks
	mockStore := &MockRecordingStore{
		Recordings: make(map[string]*ImportableRecording),
		NextID:     1,
	}
	mockWriter := &MockFileWriter{Files: make(map[string][]byte)}

	importer := NewArchiveImporter(mockStore, mockWriter)

	// Test import
	result, err := importer.Import(context.Background(), archivePath, DuplicateSkip, nil)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}

	// Verify result
	if result.ImportedCount != 1 {
		t.Errorf("expected 1 imported, got %d", result.ImportedCount)
	}
	if result.SkippedCount != 0 {
		t.Errorf("expected 0 skipped, got %d", result.SkippedCount)
	}
	if len(result.ImportedIDs) != 1 {
		t.Errorf("expected 1 imported ID, got %d", len(result.ImportedIDs))
	}

	// Verify recording was saved
	if _, ok := mockStore.Recordings["rec-123"]; !ok {
		t.Error("recording was not saved")
	}
}

func TestArchiveImporter_Import_NoManifest(t *testing.T) {
	tempDir := t.TempDir()
	archivePath := filepath.Join(tempDir, "no-manifest.zip")

	// Create archive without manifest
	zipFile, _ := os.Create(archivePath)
	zipWriter := zip.NewWriter(zipFile)
	zipWriter.Close()
	zipFile.Close()

	mockStore := &MockRecordingStore{Recordings: make(map[string]*ImportableRecording)}
	mockWriter := &MockFileWriter{}
	importer := NewArchiveImporter(mockStore, mockWriter)

	_, err := importer.Import(context.Background(), archivePath, DuplicateSkip, nil)
	if err == nil {
		t.Error("expected error for missing manifest")
	}
}

func TestArchiveImporter_Import_DuplicateSkip(t *testing.T) {
	tempDir := t.TempDir()

	mediaData := []byte("video")
	manifest := NewExportManifest(&ExportedRecording{
		ID:        "rec-123",
		Title:     "Test",
		CreatedAt: time.Now(),
		MediaFile: &ExportedFile{Filename: "video.mp4", Size: 5, Checksum: CalculateChecksum(mediaData)},
	})

	archivePath := createTestArchive(t, tempDir, manifest, map[string][]byte{"media/video.mp4": mediaData})

	// Setup with existing recording
	mockStore := &MockRecordingStore{
		Recordings: map[string]*ImportableRecording{
			"rec-123": {ID: "rec-123", Title: "Existing"},
		},
	}
	mockWriter := &MockFileWriter{}
	importer := NewArchiveImporter(mockStore, mockWriter)

	result, err := importer.Import(context.Background(), archivePath, DuplicateSkip, nil)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}

	if result.SkippedCount != 1 {
		t.Errorf("expected 1 skipped, got %d", result.SkippedCount)
	}
	if result.ImportedCount != 0 {
		t.Errorf("expected 0 imported, got %d", result.ImportedCount)
	}
}

func TestArchiveImporter_Import_DuplicateReplace(t *testing.T) {
	tempDir := t.TempDir()

	mediaData := []byte("new video")
	manifest := NewExportManifest(&ExportedRecording{
		ID:        "rec-123",
		Title:     "New Title",
		CreatedAt: time.Now(),
		MediaFile: &ExportedFile{Filename: "video.mp4", Size: 9, Checksum: CalculateChecksum(mediaData)},
	})

	archivePath := createTestArchive(t, tempDir, manifest, map[string][]byte{"media/video.mp4": mediaData})

	mockStore := &MockRecordingStore{
		Recordings: map[string]*ImportableRecording{
			"rec-123": {ID: "rec-123", Title: "Old Title"},
		},
	}
	mockWriter := &MockFileWriter{}
	importer := NewArchiveImporter(mockStore, mockWriter)

	result, err := importer.Import(context.Background(), archivePath, DuplicateReplace, nil)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}

	if result.ReplacedCount != 1 {
		t.Errorf("expected 1 replaced, got %d", result.ReplacedCount)
	}
	if mockStore.Recordings["rec-123"].Title != "New Title" {
		t.Error("recording was not updated")
	}
}

func TestArchiveImporter_Import_DuplicateRename(t *testing.T) {
	tempDir := t.TempDir()

	mediaData := []byte("video")
	manifest := NewExportManifest(&ExportedRecording{
		ID:        "rec-123",
		Title:     "Test",
		CreatedAt: time.Now(),
		MediaFile: &ExportedFile{Filename: "video.mp4", Size: 5, Checksum: CalculateChecksum(mediaData)},
	})

	archivePath := createTestArchive(t, tempDir, manifest, map[string][]byte{"media/video.mp4": mediaData})

	mockStore := &MockRecordingStore{
		Recordings: map[string]*ImportableRecording{
			"rec-123": {ID: "rec-123", Title: "Existing"},
		},
		NextID: 1,
	}
	mockWriter := &MockFileWriter{}
	importer := NewArchiveImporter(mockStore, mockWriter)

	result, err := importer.Import(context.Background(), archivePath, DuplicateRename, nil)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}

	if result.ImportedCount != 1 {
		t.Errorf("expected 1 imported, got %d", result.ImportedCount)
	}

	// Verify both recordings exist
	if _, ok := mockStore.Recordings["rec-123"]; !ok {
		t.Error("original recording missing")
	}
	if _, ok := mockStore.Recordings["rec-123-copy-1"]; !ok {
		t.Error("renamed recording missing")
	}
}

func TestArchiveImporter_Import_ChecksumMismatch(t *testing.T) {
	tempDir := t.TempDir()

	mediaData := []byte("video")
	manifest := NewExportManifest(&ExportedRecording{
		ID:        "rec-123",
		Title:     "Test",
		CreatedAt: time.Now(),
		MediaFile: &ExportedFile{Filename: "video.mp4", Size: 5, Checksum: "wrong-checksum"},
	})

	archivePath := createTestArchive(t, tempDir, manifest, map[string][]byte{"media/video.mp4": mediaData})

	mockStore := &MockRecordingStore{Recordings: make(map[string]*ImportableRecording)}
	mockWriter := &MockFileWriter{}
	importer := NewArchiveImporter(mockStore, mockWriter)

	result, err := importer.Import(context.Background(), archivePath, DuplicateSkip, nil)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}

	if len(result.Errors) != 1 {
		t.Errorf("expected 1 error, got %d", len(result.Errors))
	}
}

func TestArchiveImporter_Import_MissingMediaFile(t *testing.T) {
	tempDir := t.TempDir()

	manifest := NewExportManifest(&ExportedRecording{
		ID:        "rec-123",
		Title:     "Test",
		CreatedAt: time.Now(),
		MediaFile: &ExportedFile{Filename: "missing.mp4", Size: 5, Checksum: "abc"},
	})

	// Create archive without the media file
	archivePath := createTestArchive(t, tempDir, manifest, map[string][]byte{})

	mockStore := &MockRecordingStore{Recordings: make(map[string]*ImportableRecording)}
	mockWriter := &MockFileWriter{}
	importer := NewArchiveImporter(mockStore, mockWriter)

	result, err := importer.Import(context.Background(), archivePath, DuplicateSkip, nil)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}

	if len(result.Errors) != 1 {
		t.Errorf("expected 1 error, got %d", len(result.Errors))
	}
}

func TestArchiveImporter_Import_Bulk(t *testing.T) {
	tempDir := t.TempDir()

	mediaData1 := []byte("video1")
	mediaData2 := []byte("video2")

	manifest := NewBulkExportManifest([]*ExportedRecording{
		{
			ID:        "rec-1",
			Title:     "Recording 1",
			CreatedAt: time.Now(),
			MediaFile: &ExportedFile{Filename: "1.mp4", Size: 6, Checksum: CalculateChecksum(mediaData1)},
		},
		{
			ID:        "rec-2",
			Title:     "Recording 2",
			CreatedAt: time.Now(),
			MediaFile: &ExportedFile{Filename: "2.mp4", Size: 6, Checksum: CalculateChecksum(mediaData2)},
		},
	})

	files := map[string][]byte{
		"recordings/rec-1/media/1.mp4": mediaData1,
		"recordings/rec-2/media/2.mp4": mediaData2,
	}

	archivePath := createTestArchive(t, tempDir, manifest, files)

	mockStore := &MockRecordingStore{Recordings: make(map[string]*ImportableRecording)}
	mockWriter := &MockFileWriter{}
	importer := NewArchiveImporter(mockStore, mockWriter)

	result, err := importer.Import(context.Background(), archivePath, DuplicateSkip, nil)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}

	if result.ImportedCount != 2 {
		t.Errorf("expected 2 imported, got %d", result.ImportedCount)
	}
	if len(result.ImportedIDs) != 2 {
		t.Errorf("expected 2 imported IDs, got %d", len(result.ImportedIDs))
	}
}

func TestArchiveImporter_Import_ProgressCallback(t *testing.T) {
	tempDir := t.TempDir()

	mediaData := []byte("video")
	manifest := NewExportManifest(&ExportedRecording{
		ID:        "rec-123",
		Title:     "Test",
		CreatedAt: time.Now(),
		MediaFile: &ExportedFile{Filename: "video.mp4", Size: 5, Checksum: CalculateChecksum(mediaData)},
	})

	archivePath := createTestArchive(t, tempDir, manifest, map[string][]byte{"media/video.mp4": mediaData})

	mockStore := &MockRecordingStore{Recordings: make(map[string]*ImportableRecording)}
	mockWriter := &MockFileWriter{}
	importer := NewArchiveImporter(mockStore, mockWriter)

	progressCalls := []struct {
		percent int
		message string
	}{}

	progress := func(p int, m string) {
		progressCalls = append(progressCalls, struct {
			percent int
			message string
		}{p, m})
	}

	_, err := importer.Import(context.Background(), archivePath, DuplicateSkip, progress)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}

	if len(progressCalls) == 0 {
		t.Error("progress callback was not called")
	}

	// Verify we got start, middle, and end progress
	foundStart := false
	foundEnd := false
	for _, call := range progressCalls {
		if call.percent == 0 {
			foundStart = true
		}
		if call.percent == 100 {
			foundEnd = true
		}
	}
	if !foundStart {
		t.Error("start progress not received")
	}
	if !foundEnd {
		t.Error("end progress not received")
	}
}

func TestMockRecordingStore(t *testing.T) {
	store := &MockRecordingStore{
		Recordings: make(map[string]*ImportableRecording),
		NextID:     1,
	}

	// Test Exists
	exists, _ := store.Exists(context.Background(), "non-existent")
	if exists {
		t.Error("expected non-existent to return false")
	}

	// Test Save
	rec := &ImportableRecording{ID: "rec-1", Title: "Test"}
	id, _ := store.Save(context.Background(), rec)
	if id != "rec-1" {
		t.Errorf("expected id rec-1, got %s", id)
	}

	exists, _ = store.Exists(context.Background(), "rec-1")
	if !exists {
		t.Error("expected rec-1 to exist after save")
	}

	// Test Update
	updated := &ImportableRecording{ID: "rec-1", Title: "Updated"}
	store.Update(context.Background(), "rec-1", updated)
	if store.Recordings["rec-1"].Title != "Updated" {
		t.Error("recording was not updated")
	}

	// Test GenerateNewID
	newID := store.GenerateNewID(context.Background(), "rec-1")
	if newID != "rec-1-copy-1" {
		t.Errorf("expected rec-1-copy-1, got %s", newID)
	}
}

func TestMockFileWriter(t *testing.T) {
	writer := &MockFileWriter{Files: make(map[string][]byte)}

	data := []byte("test data")
	err := writer.WriteFile("/test/file.txt", data)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if string(writer.Files["/test/file.txt"]) != string(data) {
		t.Error("data was not written")
	}

	// EnsureDir is no-op for mock
	err = writer.EnsureDir("/test/dir")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestOSFileWriter(t *testing.T) {
	tempDir := t.TempDir()
	writer := &OSFileWriter{BasePath: tempDir}

	data := []byte("test content")
	err := writer.WriteFile("subdir/file.txt", data)
	if err != nil {
		t.Fatalf("write failed: %v", err)
	}

	// Verify file was created
	content, err := os.ReadFile(filepath.Join(tempDir, "subdir/file.txt"))
	if err != nil {
		t.Fatalf("failed to read file: %v", err)
	}
	if string(content) != string(data) {
		t.Errorf("content mismatch: got %s, want %s", string(content), string(data))
	}

	// Test EnsureDir
	err = writer.EnsureDir("another/dir")
	if err != nil {
		t.Errorf("ensure dir failed: %v", err)
	}

	info, err := os.Stat(filepath.Join(tempDir, "another/dir"))
	if err != nil {
		t.Error("directory was not created")
	}
	if !info.IsDir() {
		t.Error("path is not a directory")
	}
}
