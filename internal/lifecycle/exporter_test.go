package lifecycle

import (
	"archive/zip"
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestArchiveExporter_Export(t *testing.T) {
	// Create temp directory for test files
	tempDir := t.TempDir()

	// Setup mock data
	mockProvider := &MockRecordingProvider{
		Recordings: map[string]*ExportableRecording{
			"rec-1": {
				ID:                "rec-1",
				Title:             "Test Recording",
				Description:       "A test recording",
				CreatedAt:         time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC).UnixMilli(),
				Duration:          60000,
				MediaPath:         "/videos/test.mp4",
				TranscriptionPath: "/transcripts/test.json",
				ThumbnailPath:     "/thumbs/test.jpg",
			},
		},
	}

	mockFiles := &MockFileProvider{
		Files: map[string][]byte{
			"/videos/test.mp4":       []byte("fake video data"),
			"/transcripts/test.json": []byte(`{"words": []}`),
			"/thumbs/test.jpg":       []byte("fake thumbnail data"),
		},
	}

	exporter := NewArchiveExporter(mockProvider, mockFiles)

	// Test export
	destPath := filepath.Join(tempDir, "export.zip")
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

	err := exporter.Export(context.Background(), "rec-1", destPath, progress)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}

	// Verify file was created
	if _, err := os.Stat(destPath); os.IsNotExist(err) {
		t.Fatal("export file was not created")
	}

	// Verify ZIP contents
	r, err := zip.OpenReader(destPath)
	if err != nil {
		t.Fatalf("failed to open zip: %v", err)
	}
	defer r.Close()

	expectedFiles := map[string]bool{
		"manifest.json":           false,
		"media/test.mp4":          false,
		"transcription/test.json": false,
		"thumbnail/test.jpg":      false,
	}

	for _, f := range r.File {
		if _, ok := expectedFiles[f.Name]; ok {
			expectedFiles[f.Name] = true
		}
	}

	for name, found := range expectedFiles {
		if !found {
			t.Errorf("expected file not found in archive: %s", name)
		}
	}

	// Verify progress was called
	if len(progressCalls) == 0 {
		t.Error("progress callback was not called")
	}
}

func TestArchiveExporter_Export_NotFound(t *testing.T) {
	mockProvider := &MockRecordingProvider{
		Recordings: map[string]*ExportableRecording{},
	}
	mockFiles := &MockFileProvider{Files: map[string][]byte{}}
	exporter := NewArchiveExporter(mockProvider, mockFiles)

	tempDir := t.TempDir()
	destPath := filepath.Join(tempDir, "export.zip")

	err := exporter.Export(context.Background(), "non-existent", destPath, nil)
	if err == nil {
		t.Error("expected error for non-existent recording")
	}
}

func TestArchiveExporter_Export_MissingFile(t *testing.T) {
	mockProvider := &MockRecordingProvider{
		Recordings: map[string]*ExportableRecording{
			"rec-1": {
				ID:        "rec-1",
				Title:     "Test",
				MediaPath: "/videos/missing.mp4",
			},
		},
	}
	mockFiles := &MockFileProvider{Files: map[string][]byte{}}
	exporter := NewArchiveExporter(mockProvider, mockFiles)

	tempDir := t.TempDir()
	destPath := filepath.Join(tempDir, "export.zip")

	err := exporter.Export(context.Background(), "rec-1", destPath, nil)
	if err == nil {
		t.Error("expected error when media file is missing")
	}
}

func TestArchiveExporter_ExportAll(t *testing.T) {
	tempDir := t.TempDir()

	mockProvider := &MockRecordingProvider{
		All: []*ExportableRecording{
			{
				ID:        "rec-1",
				Title:     "Recording 1",
				CreatedAt: time.Now().UnixMilli(),
				Duration:  60000,
				MediaPath: "/videos/1.mp4",
			},
			{
				ID:        "rec-2",
				Title:     "Recording 2",
				CreatedAt: time.Now().UnixMilli(),
				Duration:  90000,
				MediaPath: "/videos/2.mp4",
			},
		},
	}

	mockFiles := &MockFileProvider{
		Files: map[string][]byte{
			"/videos/1.mp4": []byte("video 1"),
			"/videos/2.mp4": []byte("video 2"),
		},
	}

	exporter := NewArchiveExporter(mockProvider, mockFiles)
	destPath := filepath.Join(tempDir, "bulk-export.zip")

	err := exporter.ExportAll(context.Background(), destPath, nil)
	if err != nil {
		t.Fatalf("export all failed: %v", err)
	}

	// Verify ZIP contents
	r, err := zip.OpenReader(destPath)
	if err != nil {
		t.Fatalf("failed to open zip: %v", err)
	}
	defer r.Close()

	expectedFiles := []string{
		"manifest.json",
		"recordings/rec-1/media/1.mp4",
		"recordings/rec-2/media/2.mp4",
	}

	foundFiles := make(map[string]bool)
	for _, f := range r.File {
		foundFiles[f.Name] = true
	}

	for _, expected := range expectedFiles {
		if !foundFiles[expected] {
			t.Errorf("expected file not found: %s", expected)
		}
	}
}

func TestArchiveExporter_ExportAll_Empty(t *testing.T) {
	mockProvider := &MockRecordingProvider{
		All: []*ExportableRecording{},
	}
	mockFiles := &MockFileProvider{Files: map[string][]byte{}}
	exporter := NewArchiveExporter(mockProvider, mockFiles)

	tempDir := t.TempDir()
	destPath := filepath.Join(tempDir, "empty.zip")

	err := exporter.ExportAll(context.Background(), destPath, nil)
	if err == nil {
		t.Error("expected error when no recordings to export")
	}
}

func TestArchiveExporter_ExportAll_NoOptionalFiles(t *testing.T) {
	tempDir := t.TempDir()

	mockProvider := &MockRecordingProvider{
		All: []*ExportableRecording{
			{
				ID:        "rec-1",
				Title:     "Recording 1",
				CreatedAt: time.Now().UnixMilli(),
				Duration:  60000,
				MediaPath: "/videos/1.mp4",
				// No transcription or thumbnail
			},
		},
	}

	mockFiles := &MockFileProvider{
		Files: map[string][]byte{
			"/videos/1.mp4": []byte("video 1"),
		},
	}

	exporter := NewArchiveExporter(mockProvider, mockFiles)
	destPath := filepath.Join(tempDir, "export.zip")

	err := exporter.ExportAll(context.Background(), destPath, nil)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}

	// Verify only required files are present
	r, err := zip.OpenReader(destPath)
	if err != nil {
		t.Fatalf("failed to open zip: %v", err)
	}
	defer r.Close()

	if len(r.File) != 2 { // manifest + media file
		t.Errorf("expected 2 files, got %d", len(r.File))
	}
}

func TestOSFileProvider(t *testing.T) {
	tempDir := t.TempDir()
	testFile := filepath.Join(tempDir, "test.txt")
	testData := []byte("hello world")

	if err := os.WriteFile(testFile, testData, 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	provider := &OSFileProvider{}

	// Test ReadFile
	data, err := provider.ReadFile(testFile)
	if err != nil {
		t.Errorf("ReadFile failed: %v", err)
	}
	if string(data) != string(testData) {
		t.Errorf("data mismatch: got %s, want %s", string(data), string(testData))
	}

	// Test FileSize
	size, err := provider.FileSize(testFile)
	if err != nil {
		t.Errorf("FileSize failed: %v", err)
	}
	if size != int64(len(testData)) {
		t.Errorf("size mismatch: got %d, want %d", size, len(testData))
	}

	// Test non-existent file
	_, err = provider.ReadFile("/non/existent/file.txt")
	if err == nil {
		t.Error("expected error for non-existent file")
	}
}

func TestMockRecordingProvider(t *testing.T) {
	provider := &MockRecordingProvider{
		Recordings: map[string]*ExportableRecording{
			"rec-1": {ID: "rec-1", Title: "Test"},
		},
		All: []*ExportableRecording{
			{ID: "rec-1", Title: "Test"},
			{ID: "rec-2", Title: "Test 2"},
		},
	}

	// Test GetByID
	rec, err := provider.GetByID(context.Background(), "rec-1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if rec.ID != "rec-1" {
		t.Errorf("wrong recording: got %s", rec.ID)
	}

	// Test GetByID not found
	_, err = provider.GetByID(context.Background(), "non-existent")
	if err == nil {
		t.Error("expected error for non-existent recording")
	}

	// Test GetAll
	all, err := provider.GetAll(context.Background())
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("expected 2 recordings, got %d", len(all))
	}
}

func TestMockFileProvider(t *testing.T) {
	provider := &MockFileProvider{
		Files: map[string][]byte{
			"/test/file.txt": []byte("test data"),
		},
	}

	// Test ReadFile
	data, err := provider.ReadFile("/test/file.txt")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if string(data) != "test data" {
		t.Errorf("wrong data: got %s", string(data))
	}

	// Test FileSize
	size, err := provider.FileSize("/test/file.txt")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if size != 9 {
		t.Errorf("wrong size: got %d", size)
	}

	// Test not found
	_, err = provider.ReadFile("/not/found")
	if err == nil {
		t.Error("expected error for missing file")
	}
}

func TestInt64ToTime(t *testing.T) {
	// Test with known timestamp
	ms := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC).UnixMilli()
	result := int64ToTime(ms)

	expected := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)
	if !result.Equal(expected) {
		t.Errorf("time mismatch: got %v, want %v", result, expected)
	}

	// Test with milliseconds component
	ms = time.Date(2026, 4, 10, 12, 0, 0, 500000000, time.UTC).UnixMilli()
	result = int64ToTime(ms)

	expected = time.Date(2026, 4, 10, 12, 0, 0, 500000000, time.UTC)
	if !result.Equal(expected) {
		t.Errorf("time with ms mismatch: got %v, want %v", result, expected)
	}
}
