package db

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Thumbnail is the persisted thumbnail payload for a recording.
type Thumbnail struct {
	RecordingID int64
	Data        string
	MIMEType    string
	GeneratedAt time.Time
}

// ThumbnailRepository provides thumbnail-specific database operations.
type ThumbnailRepository struct {
	db *sql.DB
}

// SaveThumbnail stores a base64-encoded thumbnail payload for a recording.
func (r *ThumbnailRepository) SaveThumbnail(recordingID int64, data, mimeType string, generatedAt time.Time) error {
	if recordingID <= 0 {
		return errors.New("recording id must be greater than zero")
	}
	if strings.TrimSpace(data) == "" {
		return errors.New("thumbnail data cannot be empty")
	}
	if strings.TrimSpace(mimeType) == "" {
		mimeType = "image/jpeg"
	}

	_, err := r.db.Exec(`
		UPDATE recordings
		SET
			thumbnail_data = ?,
			thumbnail_mime_type = ?,
			thumbnail_generated_at = ?,
			updated_at = ?
		WHERE id = ?
	`, data, mimeType, generatedAt.UTC().Format(time.RFC3339Nano), time.Now().UTC(), recordingID)
	if err != nil {
		return fmt.Errorf("save thumbnail: %w", err)
	}

	return nil
}

// GetThumbnail loads the thumbnail payload for a recording.
// It returns nil if a thumbnail has not been generated yet.
func (r *ThumbnailRepository) GetThumbnail(recordingID int64) (*Thumbnail, error) {
	var thumbnail Thumbnail
	var generatedAt sql.NullString

	err := r.db.QueryRow(`
		SELECT id, thumbnail_data, thumbnail_mime_type, thumbnail_generated_at
		FROM recordings
		WHERE id = ?
	`, recordingID).Scan(
		&thumbnail.RecordingID,
		&thumbnail.Data,
		&thumbnail.MIMEType,
		&generatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get thumbnail: %w", err)
	}

	if strings.TrimSpace(thumbnail.Data) == "" {
		return nil, nil
	}

	if !generatedAt.Valid || generatedAt.String == "" {
		return nil, errors.New("thumbnail generated timestamp is missing")
	}

	parsedTime, err := time.Parse(time.RFC3339Nano, generatedAt.String)
	if err != nil {
		return nil, fmt.Errorf("parse thumbnail generated timestamp: %w", err)
	}

	thumbnail.GeneratedAt = parsedTime.UTC()
	return &thumbnail, nil
}
