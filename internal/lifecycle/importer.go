package lifecycle

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// DuplicateHandling defines how to handle duplicate recordings during import.
type DuplicateHandling int

const (
	// DuplicateSkip skips importing duplicate recordings.
	DuplicateSkip DuplicateHandling = iota
	// DuplicateReplace replaces existing recordings with imported ones.
	DuplicateReplace
	// DuplicateRename creates new recordings with modified IDs.
	DuplicateRename
)

// ImportResult represents the result of an import operation.
type ImportResult struct {
	ImportedCount int
	SkippedCount  int
	ReplacedCount int
	Errors        []error
	ImportedIDs   []string
}

// Importer defines the interface for importing recordings.
type Importer interface {
	// Import imports recordings from an archive file.
	Import(ctx context.Context, archivePath string, duplicateHandling DuplicateHandling, progress ProgressCallback) (*ImportResult, error)
}

// ArchiveImporter implements Importer using ZIP archives.
type ArchiveImporter struct {
	recordingStore RecordingStore
	fileWriter     FileWriter
}

// RecordingStore handles saving imported recordings to the database.
type RecordingStore interface {
	// Exists checks if a recording with the given ID exists.
	Exists(ctx context.Context, id string) (bool, error)

	// Save saves a new recording and returns the assigned ID.
	Save(ctx context.Context, recording *ImportableRecording) (string, error)

	// Update updates an existing recording.
	Update(ctx context.Context, id string, recording *ImportableRecording) error

	// GenerateNewID generates a new unique ID for duplicate rename handling.
	GenerateNewID(ctx context.Context, originalID string) string
}

// FileWriter handles writing files to the filesystem.
type FileWriter interface {
	// WriteFile writes data to a file, creating directories as needed.
	WriteFile(path string, data []byte) error

	// EnsureDir ensures a directory exists.
	EnsureDir(path string) error
}

// ImportableRecording represents a recording ready to be imported.
type ImportableRecording struct {
	ID                    string
	Title                 string
	Description           string
	CreatedAt             int64 // Unix timestamp in milliseconds
	Duration              int64 // Duration in milliseconds
	MediaData             []byte
	TranscriptionData     []byte
	ThumbnailData         []byte
	MediaFilename         string
	TranscriptionFilename string
	ThumbnailFilename     string
}

// NewArchiveImporter creates a new ArchiveImporter.
func NewArchiveImporter(recordingStore RecordingStore, fileWriter FileWriter) *ArchiveImporter {
	return &ArchiveImporter{
		recordingStore: recordingStore,
		fileWriter:     fileWriter,
	}
}

// Import imports recordings from a ZIP archive.
func (i *ArchiveImporter) Import(ctx context.Context, archivePath string, duplicateHandling DuplicateHandling, progress ProgressCallback) (*ImportResult, error) {
	if progress == nil {
		progress = func(int, string) {}
	}

	progress(0, "Opening archive...")

	// Open ZIP archive
	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open archive: %w", err)
	}
	defer r.Close()

	// Find and read manifest
	progress(10, "Reading manifest...")
	var manifest *ExportManifest
	for _, f := range r.File {
		if f.Name == "manifest.json" {
			manifest, err = i.readManifest(f)
			if err != nil {
				return nil, fmt.Errorf("failed to read manifest: %w", err)
			}
			break
		}
	}

	if manifest == nil {
		return nil, fmt.Errorf("manifest.json not found in archive")
	}

	// Validate manifest
	if err := manifest.Validate(); err != nil {
		return nil, fmt.Errorf("invalid manifest: %w", err)
	}

	result := &ImportResult{
		ImportedIDs: make([]string, 0),
		Errors:      make([]error, 0),
	}

	// Determine recordings to import
	recordings := manifest.Recordings
	if manifest.Recording != nil {
		recordings = []*ExportedRecording{manifest.Recording}
	}

	total := len(recordings)
	baseProgress := 20

	for idx, exportedRec := range recordings {
		progressPercent := baseProgress + (idx * (80 - baseProgress) / total)
		progress(progressPercent, fmt.Sprintf("Importing recording %d of %d: %s", idx+1, total, exportedRec.Title))

		if err := i.importRecording(ctx, r.File, exportedRec, duplicateHandling, result); err != nil {
			result.Errors = append(result.Errors, fmt.Errorf("failed to import %s: %w", exportedRec.ID, err))
		}
	}

	progress(100, "Import complete")
	return result, nil
}

// importRecording imports a single recording from the archive.
func (i *ArchiveImporter) importRecording(ctx context.Context, files []*zip.File, exportedRec *ExportedRecording, duplicateHandling DuplicateHandling, result *ImportResult) error {
	// Check for duplicates
	exists, err := i.recordingStore.Exists(ctx, exportedRec.ID)
	if err != nil {
		return fmt.Errorf("failed to check existence: %w", err)
	}

	if exists {
		switch duplicateHandling {
		case DuplicateSkip:
			result.SkippedCount++
			return nil
		case DuplicateReplace:
			// Continue to import and replace
		case DuplicateRename:
			exportedRec.ID = i.recordingStore.GenerateNewID(ctx, exportedRec.ID)
		}
	}

	// Build importable recording
	importable := &ImportableRecording{
		ID:          exportedRec.ID,
		Title:       exportedRec.Title,
		Description: exportedRec.Description,
		CreatedAt:   exportedRec.CreatedAt.UnixMilli(),
		Duration:    exportedRec.Duration,
	}

	// Extract media file
	mediaPath := i.findFileInArchive(files, exportedRec.MediaFile.Filename)
	if mediaPath == "" {
		return fmt.Errorf("media file not found in archive: %s", exportedRec.MediaFile.Filename)
	}

	mediaData, err := i.readFileFromArchive(files, mediaPath)
	if err != nil {
		return fmt.Errorf("failed to read media file: %w", err)
	}

	// Verify checksum
	actualChecksum := CalculateChecksum(mediaData)
	if actualChecksum != exportedRec.MediaFile.Checksum {
		return fmt.Errorf("media file checksum mismatch: expected %s, got %s", exportedRec.MediaFile.Checksum, actualChecksum)
	}

	importable.MediaData = mediaData
	importable.MediaFilename = exportedRec.MediaFile.Filename

	// Extract transcription if present
	if exportedRec.Transcription != nil {
		transPath := i.findFileInArchive(files, exportedRec.Transcription.Filename)
		if transPath != "" {
			transData, err := i.readFileFromArchive(files, transPath)
			if err != nil {
				return fmt.Errorf("failed to read transcription: %w", err)
			}

			actualChecksum = CalculateChecksum(transData)
			if actualChecksum != exportedRec.Transcription.Checksum {
				return fmt.Errorf("transcription checksum mismatch: expected %s, got %s", exportedRec.Transcription.Checksum, actualChecksum)
			}

			importable.TranscriptionData = transData
			importable.TranscriptionFilename = exportedRec.Transcription.Filename
		}
	}

	// Extract thumbnail if present
	if exportedRec.Thumbnail != nil {
		thumbPath := i.findFileInArchive(files, exportedRec.Thumbnail.Filename)
		if thumbPath != "" {
			thumbData, err := i.readFileFromArchive(files, thumbPath)
			if err != nil {
				return fmt.Errorf("failed to read thumbnail: %w", err)
			}

			actualChecksum = CalculateChecksum(thumbData)
			if actualChecksum != exportedRec.Thumbnail.Checksum {
				return fmt.Errorf("thumbnail checksum mismatch: expected %s, got %s", exportedRec.Thumbnail.Checksum, actualChecksum)
			}

			importable.ThumbnailData = thumbData
			importable.ThumbnailFilename = exportedRec.Thumbnail.Filename
		}
	}

	// Save recording
	if exists && duplicateHandling == DuplicateReplace {
		if err := i.recordingStore.Update(ctx, exportedRec.ID, importable); err != nil {
			return fmt.Errorf("failed to update recording: %w", err)
		}
		result.ReplacedCount++
	} else {
		id, err := i.recordingStore.Save(ctx, importable)
		if err != nil {
			return fmt.Errorf("failed to save recording: %w", err)
		}
		result.ImportedCount++
		result.ImportedIDs = append(result.ImportedIDs, id)
	}

	return nil
}

// readManifest reads and parses the manifest from the archive.
func (i *ArchiveImporter) readManifest(f *zip.File) (*ExportManifest, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	data, err := io.ReadAll(rc)
	if err != nil {
		return nil, err
	}

	return DeserializeManifest(data)
}

// readFileFromArchive reads a file from the ZIP archive.
func (i *ArchiveImporter) readFileFromArchive(files []*zip.File, name string) ([]byte, error) {
	for _, f := range files {
		if f.Name == name {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()

			return io.ReadAll(rc)
		}
	}
	return nil, fmt.Errorf("file not found: %s", name)
}

// findFileInArchive finds a file in the archive by its filename (ignoring path).
func (i *ArchiveImporter) findFileInArchive(files []*zip.File, filename string) string {
	for _, f := range files {
		if filepath.Base(f.Name) == filename {
			return f.Name
		}
	}
	return ""
}

// OSFileWriter implements FileWriter using the OS filesystem.
type OSFileWriter struct {
	BasePath string
}

// WriteFile writes data to a file, creating directories as needed.
func (w *OSFileWriter) WriteFile(path string, data []byte) error {
	fullPath := filepath.Join(w.BasePath, path)
	dir := filepath.Dir(fullPath)

	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(fullPath, data, 0644)
}

// EnsureDir ensures a directory exists.
func (w *OSFileWriter) EnsureDir(path string) error {
	fullPath := filepath.Join(w.BasePath, path)
	return os.MkdirAll(fullPath, 0755)
}

// MockRecordingStore is a mock implementation for testing.
type MockRecordingStore struct {
	Recordings map[string]*ImportableRecording
	NextID     int
}

// Exists checks if a recording exists.
func (m *MockRecordingStore) Exists(ctx context.Context, id string) (bool, error) {
	_, ok := m.Recordings[id]
	return ok, nil
}

// Save saves a new recording.
func (m *MockRecordingStore) Save(ctx context.Context, recording *ImportableRecording) (string, error) {
	id := recording.ID
	if id == "" {
		id = fmt.Sprintf("new-%d", m.NextID)
		m.NextID++
	}
	m.Recordings[id] = recording
	return id, nil
}

// Update updates an existing recording.
func (m *MockRecordingStore) Update(ctx context.Context, id string, recording *ImportableRecording) error {
	m.Recordings[id] = recording
	return nil
}

// GenerateNewID generates a new ID.
func (m *MockRecordingStore) GenerateNewID(ctx context.Context, originalID string) string {
	return fmt.Sprintf("%s-copy-%d", originalID, m.NextID)
}

// MockFileWriter is a mock implementation for testing.
type MockFileWriter struct {
	Files map[string][]byte
}

// WriteFile writes to the mock filesystem.
func (m *MockFileWriter) WriteFile(path string, data []byte) error {
	if m.Files == nil {
		m.Files = make(map[string][]byte)
	}
	m.Files[path] = data
	return nil
}

// EnsureDir is a no-op for the mock.
func (m *MockFileWriter) EnsureDir(path string) error {
	return nil
}

// Ensure interfaces are implemented.
var _ Importer = (*ArchiveImporter)(nil)
var _ RecordingStore = (*MockRecordingStore)(nil)
var _ FileWriter = (*MockFileWriter)(nil)
