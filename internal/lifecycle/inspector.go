package lifecycle

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"verbal/internal/db"
)

// RecordingRepository defines the interface needed for inspection operations.
// This allows for mocking in tests.
type RecordingRepository interface {
	List() ([]*db.Recording, error)
}

// InspectionReport contains the results of all database integrity checks.
type InspectionReport struct {
	TotalIssues           int             `json:"total_issues"`
	OrphanedRecordings    []*db.Recording `json:"orphaned_recordings"`
	MissingThumbnails     []*db.Recording `json:"missing_thumbnails"`
	InvalidTranscriptions []*db.Recording `json:"invalid_transcriptions"`
}

// DatabaseInspector provides methods for detecting database integrity issues.
type DatabaseInspector struct {
	repo RecordingRepository
}

// NewDatabaseInspector creates a new inspector instance.
func NewDatabaseInspector(repo RecordingRepository) *DatabaseInspector {
	return &DatabaseInspector{
		repo: repo,
	}
}

// CheckOrphanedRecordings finds database entries where the media file no longer exists.
// Returns a list of recordings with missing media files.
func (i *DatabaseInspector) CheckOrphanedRecordings() ([]*db.Recording, error) {
	recordings, err := i.repo.List()
	if err != nil {
		return nil, err
	}

	var orphaned []*db.Recording
	for _, rec := range recordings {
		if _, err := os.Stat(rec.FilePath); os.IsNotExist(err) {
			orphaned = append(orphaned, rec)
		}
	}

	return orphaned, nil
}

// CheckMissingThumbnails finds recordings that don't have a generated thumbnail.
// Returns a list of recordings with empty thumbnail data.
func (i *DatabaseInspector) CheckMissingThumbnails() ([]*db.Recording, error) {
	recordings, err := i.repo.List()
	if err != nil {
		return nil, err
	}

	var missingThumbs []*db.Recording
	for _, rec := range recordings {
		if rec.ThumbnailData == "" {
			missingThumbs = append(missingThumbs, rec)
		}
	}

	return missingThumbs, nil
}

// CheckInvalidTranscriptions finds recordings with transcription_status = "completed"
// but have invalid or unparseable transcription JSON.
func (i *DatabaseInspector) CheckInvalidTranscriptions() ([]*db.Recording, error) {
	recordings, err := i.repo.List()
	if err != nil {
		return nil, err
	}

	var invalid []*db.Recording
	for _, rec := range recordings {
		// Only check recordings that claim to have completed transcription
		if rec.TranscriptionStatus != "completed" {
			continue
		}

		// Skip empty transcription (this is a different issue - pending transcription)
		if rec.TranscriptionJSON == "" {
			continue
		}

		// Try to parse the JSON
		var data map[string]interface{}
		if err := json.Unmarshal([]byte(rec.TranscriptionJSON), &data); err != nil {
			invalid = append(invalid, rec)
		}
	}

	return invalid, nil
}

// RunAllChecks runs all integrity checks and returns a comprehensive report.
func (i *DatabaseInspector) RunAllChecks() (*InspectionReport, error) {
	report := &InspectionReport{}

	orphaned, err := i.CheckOrphanedRecordings()
	if err != nil {
		return nil, err
	}
	report.OrphanedRecordings = orphaned

	missingThumbs, err := i.CheckMissingThumbnails()
	if err != nil {
		return nil, err
	}
	report.MissingThumbnails = missingThumbs

	invalidTranscriptions, err := i.CheckInvalidTranscriptions()
	if err != nil {
		return nil, err
	}
	report.InvalidTranscriptions = invalidTranscriptions

	report.TotalIssues = len(orphaned) + len(missingThumbs) + len(invalidTranscriptions)

	return report, nil
}

// ToJSON serializes the inspection report to JSON format.
func (r *InspectionReport) ToJSON() ([]byte, error) {
	return json.MarshalIndent(r, "", "  ")
}

// recordingSummary represents a simplified recording for text reports.
type recordingSummary struct {
	ID        int64     `json:"id"`
	FilePath  string    `json:"file_path"`
	CreatedAt time.Time `json:"created_at"`
}

// ToText generates a human-readable text report.
func (r *InspectionReport) ToText() string {
	var sb strings.Builder

	sb.WriteString("=" + strings.Repeat("=", 50) + "\n")
	sb.WriteString("DATABASE INSPECTION REPORT\n")
	sb.WriteString("=" + strings.Repeat("=", 50) + "\n\n")

	sb.WriteString(fmt.Sprintf("Generated: %s\n", time.Now().Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("Total Issues: %d\n\n", r.TotalIssues))

	if r.TotalIssues == 0 {
		sb.WriteString("No issues found. Database is healthy.\n")
		return sb.String()
	}

	// Orphaned recordings
	sb.WriteString(strings.Repeat("-", 50) + "\n")
	sb.WriteString(fmt.Sprintf("ORPHANED RECORDINGS (%d)\n", len(r.OrphanedRecordings)))
	sb.WriteString(strings.Repeat("-", 50) + "\n")
	for _, rec := range r.OrphanedRecordings {
		sb.WriteString(fmt.Sprintf("  ID: %d\n", rec.ID))
		sb.WriteString(fmt.Sprintf("  Path: %s\n", rec.FilePath))
		sb.WriteString(fmt.Sprintf("  Created: %s\n\n", rec.CreatedAt.Format(time.RFC3339)))
	}

	// Missing thumbnails
	sb.WriteString(strings.Repeat("-", 50) + "\n")
	sb.WriteString(fmt.Sprintf("MISSING THUMBNAILS (%d)\n", len(r.MissingThumbnails)))
	sb.WriteString(strings.Repeat("-", 50) + "\n")
	for _, rec := range r.MissingThumbnails {
		sb.WriteString(fmt.Sprintf("  ID: %d\n", rec.ID))
		sb.WriteString(fmt.Sprintf("  Path: %s\n", rec.FilePath))
		sb.WriteString(fmt.Sprintf("  Created: %s\n\n", rec.CreatedAt.Format(time.RFC3339)))
	}

	// Invalid transcriptions
	sb.WriteString(strings.Repeat("-", 50) + "\n")
	sb.WriteString(fmt.Sprintf("INVALID TRANSCRIPTIONS (%d)\n", len(r.InvalidTranscriptions)))
	sb.WriteString(strings.Repeat("-", 50) + "\n")
	for _, rec := range r.InvalidTranscriptions {
		sb.WriteString(fmt.Sprintf("  ID: %d\n", rec.ID))
		sb.WriteString(fmt.Sprintf("  Path: %s\n", rec.FilePath))
		sb.WriteString(fmt.Sprintf("  Created: %s\n\n", rec.CreatedAt.Format(time.RFC3339)))
	}

	return sb.String()
}

// SaveToFile saves the inspection report as JSON to the specified path.
func (r *InspectionReport) SaveToFile(path string) error {
	data, err := r.ToJSON()
	if err != nil {
		return fmt.Errorf("failed to serialize report: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write report file: %w", err)
	}

	return nil
}
