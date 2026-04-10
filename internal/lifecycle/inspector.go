package lifecycle

import (
	"encoding/json"
	"os"

	"verbal/internal/db"
)

// RecordingRepository defines the interface needed for inspection operations.
// This allows for mocking in tests.
type RecordingRepository interface {
	List() ([]*db.Recording, error)
}

// InspectionReport contains the results of all database integrity checks.
type InspectionReport struct {
	TotalIssues           int
	OrphanedRecordings    []*db.Recording
	MissingThumbnails     []*db.Recording
	InvalidTranscriptions []*db.Recording
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
