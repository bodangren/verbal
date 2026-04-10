package lifecycle

import (
	"archive/zip"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ProgressCallback is called during export operations to report progress.
type ProgressCallback func(percent int, message string)

// Exporter defines the interface for exporting recordings.
type Exporter interface {
	// Export exports a single recording by ID to the specified destination.
	Export(ctx context.Context, recordingID string, destPath string, progress ProgressCallback) error

	// ExportAll exports all recordings to the specified destination.
	ExportAll(ctx context.Context, destPath string, progress ProgressCallback) error
}

// ArchiveExporter implements Exporter using ZIP archives.
type ArchiveExporter struct {
	recordingProvider RecordingProvider
	fileProvider      FileProvider
}

// RecordingProvider retrieves recording metadata for export.
type RecordingProvider interface {
	GetByID(ctx context.Context, id string) (*ExportableRecording, error)
	GetAll(ctx context.Context) ([]*ExportableRecording, error)
}

// FileProvider reads file data for export.
type FileProvider interface {
	ReadFile(path string) ([]byte, error)
	FileSize(path string) (int64, error)
}

// ExportableRecording represents a recording ready for export.
type ExportableRecording struct {
	ID                string
	Title             string
	Description       string
	CreatedAt         int64 // Unix timestamp in milliseconds
	Duration          int64 // Duration in milliseconds
	MediaPath         string
	TranscriptionPath string
	ThumbnailPath     string
}

// NewArchiveExporter creates a new ArchiveExporter.
func NewArchiveExporter(recordingProvider RecordingProvider, fileProvider FileProvider) *ArchiveExporter {
	return &ArchiveExporter{
		recordingProvider: recordingProvider,
		fileProvider:      fileProvider,
	}
}

// Export exports a single recording as a ZIP archive.
func (e *ArchiveExporter) Export(ctx context.Context, recordingID string, destPath string, progress ProgressCallback) error {
	if progress == nil {
		progress = func(int, string) {}
	}

	progress(0, "Fetching recording metadata...")

	recording, err := e.recordingProvider.GetByID(ctx, recordingID)
	if err != nil {
		return fmt.Errorf("failed to get recording: %w", err)
	}

	progress(10, "Preparing export...")

	// Create ZIP archive
	zipFile, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create archive: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// Build exported recording structure
	exportedRec := &ExportedRecording{
		ID:          recording.ID,
		Title:       recording.Title,
		Description: recording.Description,
		CreatedAt:   int64ToTime(recording.CreatedAt),
		Duration:    recording.Duration,
	}

	// Add media file
	progress(20, "Adding media file...")
	mediaFile, err := e.addFileToArchive(zipWriter, recording.MediaPath, "media/")
	if err != nil {
		return fmt.Errorf("failed to add media file: %w", err)
	}
	exportedRec.MediaFile = mediaFile

	// Add transcription if available
	if recording.TranscriptionPath != "" {
		progress(50, "Adding transcription...")
		transFile, err := e.addFileToArchive(zipWriter, recording.TranscriptionPath, "transcription/")
		if err != nil {
			return fmt.Errorf("failed to add transcription: %w", err)
		}
		exportedRec.Transcription = transFile
	}

	// Add thumbnail if available
	if recording.ThumbnailPath != "" {
		progress(75, "Adding thumbnail...")
		thumbFile, err := e.addFileToArchive(zipWriter, recording.ThumbnailPath, "thumbnail/")
		if err != nil {
			return fmt.Errorf("failed to add thumbnail: %w", err)
		}
		exportedRec.Thumbnail = thumbFile
	}

	// Create and add manifest
	progress(90, "Creating manifest...")
	manifest := NewExportManifest(exportedRec)
	manifestData, err := manifest.Serialize()
	if err != nil {
		return fmt.Errorf("failed to serialize manifest: %w", err)
	}

	manifestWriter, err := zipWriter.Create("manifest.json")
	if err != nil {
		return fmt.Errorf("failed to create manifest in archive: %w", err)
	}

	if _, err := manifestWriter.Write(manifestData); err != nil {
		return fmt.Errorf("failed to write manifest: %w", err)
	}

	progress(100, "Export complete")
	return nil
}

// ExportAll exports all recordings as a single ZIP archive.
func (e *ArchiveExporter) ExportAll(ctx context.Context, destPath string, progress ProgressCallback) error {
	if progress == nil {
		progress = func(int, string) {}
	}

	progress(0, "Fetching all recordings...")

	recordings, err := e.recordingProvider.GetAll(ctx)
	if err != nil {
		return fmt.Errorf("failed to get recordings: %w", err)
	}

	if len(recordings) == 0 {
		return fmt.Errorf("no recordings to export")
	}

	progress(5, fmt.Sprintf("Found %d recordings", len(recordings)))

	// Create ZIP archive
	zipFile, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create archive: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	exportedRecordings := make([]*ExportedRecording, 0, len(recordings))

	for i, recording := range recordings {
		baseProgress := 5 + (i * 90 / len(recordings))
		progress(baseProgress, fmt.Sprintf("Exporting recording %d of %d: %s", i+1, len(recordings), recording.Title))

		exportedRec := &ExportedRecording{
			ID:          recording.ID,
			Title:       recording.Title,
			Description: recording.Description,
			CreatedAt:   int64ToTime(recording.CreatedAt),
			Duration:    recording.Duration,
		}

		// Add files with recording-specific prefixes
		prefix := fmt.Sprintf("recordings/%s/", recording.ID)

		// Media file
		mediaFile, err := e.addFileToArchive(zipWriter, recording.MediaPath, prefix+"media/")
		if err != nil {
			return fmt.Errorf("failed to add media file for %s: %w", recording.ID, err)
		}
		exportedRec.MediaFile = mediaFile

		// Transcription
		if recording.TranscriptionPath != "" {
			transFile, err := e.addFileToArchive(zipWriter, recording.TranscriptionPath, prefix+"transcription/")
			if err != nil {
				return fmt.Errorf("failed to add transcription for %s: %w", recording.ID, err)
			}
			exportedRec.Transcription = transFile
		}

		// Thumbnail
		if recording.ThumbnailPath != "" {
			thumbFile, err := e.addFileToArchive(zipWriter, recording.ThumbnailPath, prefix+"thumbnail/")
			if err != nil {
				return fmt.Errorf("failed to add thumbnail for %s: %w", recording.ID, err)
			}
			exportedRec.Thumbnail = thumbFile
		}

		exportedRecordings = append(exportedRecordings, exportedRec)
	}

	// Create and add manifest
	progress(95, "Creating manifest...")
	manifest := NewBulkExportManifest(exportedRecordings)
	manifestData, err := manifest.Serialize()
	if err != nil {
		return fmt.Errorf("failed to serialize manifest: %w", err)
	}

	manifestWriter, err := zipWriter.Create("manifest.json")
	if err != nil {
		return fmt.Errorf("failed to create manifest in archive: %w", err)
	}

	if _, err := manifestWriter.Write(manifestData); err != nil {
		return fmt.Errorf("failed to write manifest: %w", err)
	}

	progress(100, "Export complete")
	return nil
}

// addFileToArchive adds a file to the ZIP archive and returns its metadata.
func (e *ArchiveExporter) addFileToArchive(zipWriter *zip.Writer, filePath, destPrefix string) (*ExportedFile, error) {
	data, err := e.fileProvider.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	filename := filepath.Base(filePath)
	destPath := destPrefix + filename

	writer, err := zipWriter.Create(destPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create entry in archive: %w", err)
	}

	if _, err := writer.Write(data); err != nil {
		return nil, fmt.Errorf("failed to write file to archive: %w", err)
	}

	return &ExportedFile{
		Filename: filename,
		Size:     int64(len(data)),
		Checksum: CalculateChecksum(data),
	}, nil
}

// int64ToTime converts milliseconds since epoch to time.Time.
func int64ToTime(ms int64) time.Time {
	return time.Unix(ms/1000, (ms%1000)*1000000).UTC()
}

// OSFileProvider implements FileProvider using the OS filesystem.
type OSFileProvider struct{}

// ReadFile reads the contents of a file.
func (p *OSFileProvider) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

// FileSize returns the size of a file.
func (p *OSFileProvider) FileSize(path string) (int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

// MockRecordingProvider is a mock implementation for testing.
type MockRecordingProvider struct {
	Recordings map[string]*ExportableRecording
	All        []*ExportableRecording
}

// GetByID retrieves a recording by ID.
func (m *MockRecordingProvider) GetByID(ctx context.Context, id string) (*ExportableRecording, error) {
	if rec, ok := m.Recordings[id]; ok {
		return rec, nil
	}
	return nil, fmt.Errorf("recording not found: %s", id)
}

// GetAll retrieves all recordings.
func (m *MockRecordingProvider) GetAll(ctx context.Context) ([]*ExportableRecording, error) {
	return m.All, nil
}

// MockFileProvider is a mock implementation for testing.
type MockFileProvider struct {
	Files map[string][]byte
}

// ReadFile reads file contents from the mock.
func (m *MockFileProvider) ReadFile(path string) ([]byte, error) {
	if data, ok := m.Files[path]; ok {
		return data, nil
	}
	return nil, fmt.Errorf("file not found: %s", path)
}

// FileSize returns the size of a mock file.
func (m *MockFileProvider) FileSize(path string) (int64, error) {
	if data, ok := m.Files[path]; ok {
		return int64(len(data)), nil
	}
	return 0, fmt.Errorf("file not found: %s", path)
}

// Ensure interfaces are implemented.
var _ Exporter = (*ArchiveExporter)(nil)
var _ RecordingProvider = (*MockRecordingProvider)(nil)
var _ FileProvider = (*MockFileProvider)(nil)
