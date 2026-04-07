package db

import (
	"fmt"
	"time"
)

// RecordingService provides high-level operations for managing recordings.
type RecordingService struct {
	db *Database
}

// NewRecordingService creates a new RecordingService.
func NewRecordingService(db *Database) *RecordingService {
	return &RecordingService{db: db}
}

// GetLibrary returns all recordings in the library, ordered by newest first.
func (s *RecordingService) GetLibrary() ([]*Recording, error) {
	return s.db.RecordingRepo().List()
}

// Search searches recordings by file path and transcription content.
func (s *RecordingService) Search(query string) ([]*Recording, error) {
	if query == "" {
		return s.GetLibrary()
	}

	// Search by path first
	byPath, err := s.db.RecordingRepo().SearchByPath(query)
	if err != nil {
		return nil, fmt.Errorf("search by path: %w", err)
	}

	// Search by transcription
	byTranscription, err := s.db.RecordingRepo().SearchByTranscription(query)
	if err != nil {
		return nil, fmt.Errorf("search by transcription: %w", err)
	}

	// Merge results, removing duplicates
	resultMap := make(map[int64]*Recording)
	for _, rec := range byPath {
		resultMap[rec.ID] = rec
	}
	for _, rec := range byTranscription {
		resultMap[rec.ID] = rec
	}

	// Convert map back to slice
	results := make([]*Recording, 0, len(resultMap))
	for _, rec := range resultMap {
		results = append(results, rec)
	}

	return results, nil
}

// AddRecording adds a new recording to the library or updates an existing one.
// If a recording with the same file path exists, it will be updated.
func (s *RecordingService) AddRecording(filePath string, duration time.Duration) (*Recording, error) {
	rec := &Recording{
		FilePath:            filePath,
		Duration:            duration,
		TranscriptionStatus: "pending",
	}

	if err := s.db.RecordingRepo().UpdateOrInsert(rec); err != nil {
		return nil, fmt.Errorf("add recording: %w", err)
	}

	return rec, nil
}

// UpdateTranscription updates the transcription data for a recording.
func (s *RecordingService) UpdateTranscription(id int64, transcriptionJSON string) error {
	// First, get the existing recording
	rec, err := s.db.RecordingRepo().GetByID(id)
	if err != nil {
		return fmt.Errorf("get recording: %w", err)
	}

	// Update transcription data
	rec.TranscriptionJSON = transcriptionJSON
	rec.TranscriptionStatus = "completed"

	if err := s.db.RecordingRepo().Update(rec); err != nil {
		return fmt.Errorf("update transcription: %w", err)
	}

	return nil
}

// GetByID retrieves a recording by its ID.
func (s *RecordingService) GetByID(id int64) (*Recording, error) {
	return s.db.RecordingRepo().GetByID(id)
}

// Delete removes a recording from the library.
func (s *RecordingService) Delete(id int64) error {
	return s.db.RecordingRepo().Delete(id)
}

// GetRecent returns the most recent recordings up to the specified limit.
func (s *RecordingService) GetRecent(limit int) ([]*Recording, error) {
	return s.db.RecordingRepo().ListRecent(limit)
}
