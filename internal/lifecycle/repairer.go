package lifecycle

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"verbal/internal/db"
)

// ThumbnailGenerator defines the interface for generating thumbnails.
// This abstraction allows for mocking in tests and future backend flexibility.
type ThumbnailGenerator interface {
	Generate(videoPath string) (data []byte, mimeType string, err error)
}

// WritableRecordingRepository extends RecordingRepository with write operations.
type WritableRecordingRepository interface {
	RecordingRepository
	GetByID(id int64) (*db.Recording, error)
	Delete(id int64) error
	Update(rec *db.Recording) error
}

// RepairReport contains the results of all repair operations.
type RepairReport struct {
	TotalRepairs          int      `json:"total_repairs"`
	RemovedOrphans        []int64  `json:"removed_orphans"`
	MarkedUnavailable     []int64  `json:"marked_unavailable"`
	RegeneratedThumbnails []int64  `json:"regenerated_thumbnails"`
	Errors                []string `json:"errors"`
}

// DatabaseRepairer provides methods for resolving database integrity issues.
type DatabaseRepairer struct {
	repo      WritableRecordingRepository
	generator ThumbnailGenerator
}

// NewDatabaseRepairer creates a new repairer instance.
// The generator parameter can be nil if thumbnail regeneration is not needed.
func NewDatabaseRepairer(repo WritableRecordingRepository, generator ThumbnailGenerator) *DatabaseRepairer {
	return &DatabaseRepairer{
		repo:      repo,
		generator: generator,
	}
}

// RemoveOrphanedEntry deletes a database entry for a recording whose media file is missing.
func (r *DatabaseRepairer) RemoveOrphanedEntry(recordingID int64) error {
	// Verify the recording exists first
	_, err := r.repo.GetByID(recordingID)
	if err != nil {
		return fmt.Errorf("recording not found: %w", err)
	}

	// Delete the recording
	if err := r.repo.Delete(recordingID); err != nil {
		return fmt.Errorf("failed to delete orphaned recording: %w", err)
	}

	return nil
}

// MarkAsUnavailable updates the recording's transcription status to "unavailable"
// to indicate that the media file is missing but metadata is preserved.
func (r *DatabaseRepairer) MarkAsUnavailable(recordingID int64) error {
	// Get the recording
	rec, err := r.repo.GetByID(recordingID)
	if err != nil {
		return fmt.Errorf("recording not found: %w", err)
	}

	// Update the status
	rec.TranscriptionStatus = "unavailable"
	rec.UpdatedAt = time.Now()

	if err := r.repo.Update(rec); err != nil {
		return fmt.Errorf("failed to update recording status: %w", err)
	}

	return nil
}

// RegenerateThumbnail creates a new thumbnail for a recording using the provided generator.
func (r *DatabaseRepairer) RegenerateThumbnail(recordingID int64, mediaFilePath string) error {
	if r.generator == nil {
		return errors.New("thumbnail generator not configured")
	}

	// Verify the recording exists
	rec, err := r.repo.GetByID(recordingID)
	if err != nil {
		return fmt.Errorf("recording not found: %w", err)
	}

	// Verify the media file exists
	if _, err := os.Stat(mediaFilePath); os.IsNotExist(err) {
		return fmt.Errorf("media file not found: %s", mediaFilePath)
	}

	// Generate the thumbnail
	data, mimeType, err := r.generator.Generate(mediaFilePath)
	if err != nil {
		return fmt.Errorf("thumbnail generation failed: %w", err)
	}

	// Update the recording with the new thumbnail
	rec.ThumbnailData = base64.StdEncoding.EncodeToString(data)
	rec.ThumbnailMIMEType = mimeType
	now := time.Now()
	rec.ThumbnailGeneratedAt = &now
	rec.UpdatedAt = now

	if err := r.repo.Update(rec); err != nil {
		return fmt.Errorf("failed to save thumbnail: %w", err)
	}

	return nil
}

// RepairAll performs all applicable repairs based on the inspection report.
// It removes orphaned entries and regenerates missing thumbnails.
func (r *DatabaseRepairer) RepairAll(inspection *InspectionReport) (*RepairReport, error) {
	report := &RepairReport{}

	// Remove orphaned recordings
	for _, rec := range inspection.OrphanedRecordings {
		if err := r.RemoveOrphanedEntry(rec.ID); err != nil {
			report.Errors = append(report.Errors, fmt.Sprintf("failed to remove orphan %d: %v", rec.ID, err))
		} else {
			report.RemovedOrphans = append(report.RemovedOrphans, rec.ID)
			report.TotalRepairs++
		}
	}

	// Regenerate missing thumbnails
	for _, rec := range inspection.MissingThumbnails {
		// Skip if the file doesn't exist (orphaned) - already handled above or should be skipped
		if _, err := os.Stat(rec.FilePath); os.IsNotExist(err) {
			continue
		}

		if err := r.RegenerateThumbnail(rec.ID, rec.FilePath); err != nil {
			report.Errors = append(report.Errors, fmt.Sprintf("failed to regenerate thumbnail %d: %v", rec.ID, err))
		} else {
			report.RegeneratedThumbnails = append(report.RegeneratedThumbnails, rec.ID)
			report.TotalRepairs++
		}
	}

	return report, nil
}

// RepairResult represents the outcome of a single repair operation.
type RepairResult struct {
	Success bool
	Action  string
	Error   error
}

// ToJSON serializes the repair report to JSON format.
func (r *RepairReport) ToJSON() ([]byte, error) {
	return json.MarshalIndent(r, "", "  ")
}

// ToText generates a human-readable text report.
func (r *RepairReport) ToText() string {
	var sb strings.Builder

	sb.WriteString("=" + strings.Repeat("=", 50) + "\n")
	sb.WriteString("DATABASE REPAIR REPORT\n")
	sb.WriteString("=" + strings.Repeat("=", 50) + "\n\n")

	sb.WriteString(fmt.Sprintf("Generated: %s\n", time.Now().Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("Total Repairs: %d\n", r.TotalRepairs))
	sb.WriteString(fmt.Sprintf("Removed Orphans: %d\n", len(r.RemovedOrphans)))
	sb.WriteString(fmt.Sprintf("Marked Unavailable: %d\n", len(r.MarkedUnavailable)))
	sb.WriteString(fmt.Sprintf("Regenerated Thumbnails: %d\n\n", len(r.RegeneratedThumbnails)))

	if len(r.Errors) > 0 {
		sb.WriteString(strings.Repeat("-", 50) + "\n")
		sb.WriteString("ERRORS\n")
		sb.WriteString(strings.Repeat("-", 50) + "\n")
		for _, err := range r.Errors {
			sb.WriteString(fmt.Sprintf("  - %s\n", err))
		}
		sb.WriteString("\n")
	} else {
		sb.WriteString("No errors occurred during repair.\n\n")
	}

	return sb.String()
}

// SaveToFile saves the repair report as JSON to the specified path.
func (r *RepairReport) SaveToFile(path string) error {
	data, err := r.ToJSON()
	if err != nil {
		return fmt.Errorf("failed to serialize report: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write report file: %w", err)
	}

	return nil
}
