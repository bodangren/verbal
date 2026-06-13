package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// Recording represents a video/audio recording in the database.
type Recording struct {
	ID                   int64
	FilePath             string
	Duration             time.Duration
	TranscriptionStatus  string
	TranscriptionJSON    string
	ThumbnailData        string
	ThumbnailMIMEType    string
	ThumbnailGeneratedAt *time.Time
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// IsAvailable checks if the recording's media file exists on disk.
func (r *Recording) IsAvailable() bool {
	if r == nil || r.FilePath == "" {
		return false
	}
	_, err := os.Stat(r.FilePath)
	return err == nil
}

// AutoSave represents the auto-saved state of a project.
type AutoSave struct {
	ID               int64
	ProjectID        int64
	TranscriptJSON   string
	OperationsJSON   string
	PlaybackPosition int64
	SavedAt          time.Time
}

// AutoSaveInfo provides lightweight info about an auto-save without loading full data.
type AutoSaveInfo struct {
	ProjectID           int64
	SavedAt             time.Time
	HasData             bool
	TranscriptWordCount int
	PlaybackPosition    int64
}

// AutoSaveRepository provides CRUD operations for auto-save data.
type AutoSaveRepository struct {
	db *sql.DB
}

// scanner is an interface that wraps the Scan method for row scanning.
// It allows scanRecording to work with both sql.Row and sql.Rows.
type scanner interface {
	Scan(dest ...interface{}) error
}

// recordingColumns is the standard SELECT column list for recording queries.
const recordingColumns = `id, file_path, duration, transcription_status, transcription_json,
	thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
	created_at, updated_at`

// scanRecording scans a single row into a Recording struct.
// It handles the duration conversion and thumbnail timestamp parsing.
func scanRecording(s scanner) (*Recording, error) {
	rec := &Recording{}
	var durationNS int64
	var thumbnailGeneratedAt sql.NullString

	err := s.Scan(
		&rec.ID,
		&rec.FilePath,
		&durationNS,
		&rec.TranscriptionStatus,
		&rec.TranscriptionJSON,
		&rec.ThumbnailData,
		&rec.ThumbnailMIMEType,
		&thumbnailGeneratedAt,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	rec.Duration = time.Duration(durationNS)
	rec.ThumbnailGeneratedAt = parseThumbnailGeneratedAt(thumbnailGeneratedAt)
	return rec, nil
}

// Database wraps the SQL database connection.
type Database struct {
	path string
	db   *sql.DB
}

// NewDatabase creates or opens a SQLite database at the given path.
func NewDatabase(dbPath string) (*Database, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	if _, err := db.Exec(`PRAGMA busy_timeout = 5000`); err != nil {
		return nil, fmt.Errorf("set busy timeout: %w", err)
	}
	if _, err := db.Exec(`PRAGMA journal_mode = WAL`); err != nil {
		return nil, fmt.Errorf("set journal mode: %w", err)
	}

	database := &Database{
		path: dbPath,
		db:   db,
	}

	if err := database.migrate(); err != nil {
		return nil, fmt.Errorf("migrate database: %w", err)
	}

	return database, nil
}

// Close closes the database connection.
func (d *Database) Close() error {
	return d.db.Close()
}

// GetDBPath returns the path to the database file.
func (d *Database) GetDBPath() string {
	return d.path
}

// GetDB returns the underlying sql.DB connection for atomic backup operations.
func (d *Database) GetDB() *sql.DB {
	return d.db
}

// RecordingRepo returns a RecordingRepository for CRUD operations.
func (d *Database) RecordingRepo() *RecordingRepository {
	return &RecordingRepository{db: d.db}
}

// ThumbnailRepo returns a ThumbnailRepository for thumbnail operations.
func (d *Database) ThumbnailRepo() *ThumbnailRepository {
	return &ThumbnailRepository{db: d.db}
}

// AutoSaveRepo returns an AutoSaveRepository for auto-save operations.
func (d *Database) AutoSaveRepo() *AutoSaveRepository {
	return &AutoSaveRepository{db: d.db}
}

// BatchQueueRepo returns a BatchQueueRepository for batch queue operations.
func (d *Database) BatchQueueRepo() *BatchQueueRepository {
	return &BatchQueueRepository{db: d.db}
}

// migrate runs the versioned schema migrations.
func (d *Database) migrate() error {
	return Migrate(d.db)
}

// RecordingRepository provides CRUD operations for recordings.
type RecordingRepository struct {
	db *sql.DB
}

// Insert adds a new recording to the database and sets its ID.
func (r *RecordingRepository) Insert(rec *Recording) error {
	now := time.Now()
	rec.CreatedAt = now
	rec.UpdatedAt = now

	result, err := r.db.Exec(`
		INSERT INTO recordings (
			file_path, duration, transcription_status, transcription_json,
			thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
			created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		rec.FilePath,
		rec.Duration.Nanoseconds(),
		rec.TranscriptionStatus,
		rec.TranscriptionJSON,
		rec.ThumbnailData,
		rec.ThumbnailMIMEType,
		thumbnailGeneratedAtValue(rec.ThumbnailGeneratedAt),
		rec.CreatedAt,
		rec.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert recording: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("get last insert id: %w", err)
	}

	rec.ID = id
	return nil
}

// GetByID retrieves a recording by its ID.
func (r *RecordingRepository) GetByID(id int64) (*Recording, error) {
	rec, err := scanRecording(r.db.QueryRow(`
		SELECT `+recordingColumns+`
		FROM recordings
		WHERE id = ?
	`, id))
	if err != nil {
		return nil, fmt.Errorf("get recording by id: %w", err)
	}
	return rec, nil
}

// GetByPathExact retrieves a recording by exact file path.
func (r *RecordingRepository) GetByPathExact(filePath string) (*Recording, error) {
	rec, err := scanRecording(r.db.QueryRow(`
		SELECT `+recordingColumns+`
		FROM recordings
		WHERE file_path = ?
	`, filePath))
	if err != nil {
		return nil, fmt.Errorf("get recording by path: %w", err)
	}
	return rec, nil
}

// List returns all recordings ordered by created_at descending (newest first).
func (r *RecordingRepository) List() ([]*Recording, error) {
	rows, err := r.db.Query(`
		SELECT ` + recordingColumns + `
		FROM recordings
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list recordings: %w", err)
	}
	defer rows.Close()

	return scanRecordings(rows)
}

// scanRecordings scans multiple rows into a slice of Recording structs.
func scanRecordings(rows *sql.Rows) ([]*Recording, error) {
	var recordings []*Recording
	for rows.Next() {
		rec, err := scanRecording(rows)
		if err != nil {
			return nil, fmt.Errorf("scan recording: %w", err)
		}
		recordings = append(recordings, rec)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recordings: %w", err)
	}

	return recordings, nil
}

// Update modifies an existing recording in the database.
func (r *RecordingRepository) Update(rec *Recording) error {
	rec.UpdatedAt = time.Now()

	_, err := r.db.Exec(`
		UPDATE recordings
		SET
			file_path = ?, duration = ?, transcription_status = ?, transcription_json = ?,
			thumbnail_data = ?, thumbnail_mime_type = ?, thumbnail_generated_at = ?,
			updated_at = ?
		WHERE id = ?
	`,
		rec.FilePath,
		rec.Duration.Nanoseconds(),
		rec.TranscriptionStatus,
		rec.TranscriptionJSON,
		rec.ThumbnailData,
		rec.ThumbnailMIMEType,
		thumbnailGeneratedAtValue(rec.ThumbnailGeneratedAt),
		rec.UpdatedAt,
		rec.ID,
	)
	if err != nil {
		return fmt.Errorf("update recording: %w", err)
	}

	return nil
}

// Delete removes a recording from the database.
func (r *RecordingRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM recordings WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete recording: %w", err)
	}

	return nil
}

// ListByStatus returns recordings with the given transcription status,
// ordered by created_at descending (newest first). It validates the status
// argument and returns an error for unrecognized values.
func (r *RecordingRepository) ListByStatus(status RecordingStatus) ([]*Recording, error) {
	if err := ValidateRecordingStatus(string(status)); err != nil {
		return nil, err
	}

	rows, err := r.db.Query(`
		SELECT `+recordingColumns+`
		FROM recordings
		WHERE transcription_status = ?
		ORDER BY created_at DESC
	`, string(status))
	if err != nil {
		return nil, fmt.Errorf("list recordings by status: %w", err)
	}
	defer rows.Close()

	return scanRecordings(rows)
}

// SearchByTranscription searches recordings by transcription content.
func (r *RecordingRepository) SearchByTranscription(query string) ([]*Recording, error) {
	likeQuery := "%" + query + "%"

	rows, err := r.db.Query(`
		SELECT `+recordingColumns+`
		FROM recordings
		WHERE transcription_json LIKE ?
		ORDER BY created_at DESC
	`, likeQuery)
	if err != nil {
		return nil, fmt.Errorf("search recordings: %w", err)
	}
	defer rows.Close()

	return scanRecordings(rows)
}

// ListRecent returns the most recent recordings up to the specified limit.
func (r *RecordingRepository) ListRecent(limit int) ([]*Recording, error) {
	rows, err := r.db.Query(`
		SELECT `+recordingColumns+`
		FROM recordings
		ORDER BY created_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent recordings: %w", err)
	}
	defer rows.Close()

	return scanRecordings(rows)
}

// SearchByPath searches recordings by file path (case-insensitive LIKE search).
func (r *RecordingRepository) SearchByPath(query string) ([]*Recording, error) {
	likeQuery := "%" + query + "%"

	rows, err := r.db.Query(`
		SELECT `+recordingColumns+`
		FROM recordings
		WHERE file_path LIKE ?
		ORDER BY created_at DESC
	`, likeQuery)
	if err != nil {
		return nil, fmt.Errorf("search recordings by path: %w", err)
	}
	defer rows.Close()

	return scanRecordings(rows)
}

// UpdateOrInsert updates an existing recording or inserts a new one based on file_path.
// If a recording with the same file_path exists, it updates it. Otherwise, it inserts a new record.
func (r *RecordingRepository) UpdateOrInsert(rec *Recording) error {
	// Check if a recording with this file_path already exists
	var existingID int64
	err := r.db.QueryRow(`SELECT id FROM recordings WHERE file_path = ?`, rec.FilePath).Scan(&existingID)

	if err == nil {
		// Recording exists, update it
		rec.ID = existingID
		return r.Update(rec)
	}

	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check existing recording: %w", err)
	}

	// Recording doesn't exist, insert it
	return r.Insert(rec)
}

func thumbnailGeneratedAtValue(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339Nano)
}

func parseThumbnailGeneratedAt(value sql.NullString) *time.Time {
	if !value.Valid || value.String == "" {
		return nil
	}

	parsed, err := time.Parse(time.RFC3339Nano, value.String)
	if err != nil {
		return nil
	}
	parsed = parsed.UTC()
	return &parsed
}

// AutoSaveRepository provides CRUD operations for auto-save data.

// autoSaveColumns is the standard SELECT column list for auto_save queries.
const autoSaveColumns = `id, project_id, transcript_json, operations_json, playback_position, saved_at`

// scanAutoSave scans a single row into an AutoSave struct.
func scanAutoSave(s scanner) (*AutoSave, error) {
	autoSave := &AutoSave{}
	var savedAt string

	err := s.Scan(
		&autoSave.ID,
		&autoSave.ProjectID,
		&autoSave.TranscriptJSON,
		&autoSave.OperationsJSON,
		&autoSave.PlaybackPosition,
		&savedAt,
	)
	if err != nil {
		return nil, err
	}

	if savedAt != "" {
		autoSave.SavedAt, _ = time.Parse(time.RFC3339, savedAt)
	}

	return autoSave, nil
}

// SaveAutoSave saves or updates auto-save data for a project.
// Uses INSERT ... ON CONFLICT UPDATE to upsert.
func (r *AutoSaveRepository) SaveAutoSave(as *AutoSave) error {
	as.SavedAt = time.Now()

	_, err := r.db.Exec(`
		INSERT INTO auto_save (project_id, transcript_json, operations_json, playback_position, saved_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(project_id) DO UPDATE SET
			transcript_json = excluded.transcript_json,
			operations_json = excluded.operations_json,
			playback_position = excluded.playback_position,
			saved_at = excluded.saved_at
	`,
		as.ProjectID,
		as.TranscriptJSON,
		as.OperationsJSON,
		as.PlaybackPosition,
		as.SavedAt,
	)
	if err != nil {
		return fmt.Errorf("save auto_save: %w", err)
	}

	if as.ID == 0 {
		var id int64
		err := r.db.QueryRow(`SELECT id FROM auto_save WHERE project_id = ?`, as.ProjectID).Scan(&id)
		if err != nil {
			return fmt.Errorf("get auto_save id: %w", err)
		}
		as.ID = id
	}

	return nil
}

// LoadAutoSave retrieves the auto-save data for a project.
func (r *AutoSaveRepository) LoadAutoSave(projectID int64) (*AutoSave, error) {
	autoSave, err := scanAutoSave(r.db.QueryRow(`
		SELECT `+autoSaveColumns+`
		FROM auto_save
		WHERE project_id = ?
	`, projectID))
	if err != nil {
		return nil, fmt.Errorf("load auto_save: %w", err)
	}
	return autoSave, nil
}

// HasAutoSave checks if auto-save data exists for a project.
func (r *AutoSaveRepository) HasAutoSave(projectID int64) (bool, error) {
	var exists int
	err := r.db.QueryRow(`SELECT 1 FROM auto_save WHERE project_id = ?`, projectID).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("has auto_save: %w", err)
	}
	return true, nil
}

// DeleteAutoSave removes auto-save data for a project.
func (r *AutoSaveRepository) DeleteAutoSave(projectID int64) error {
	_, err := r.db.Exec(`DELETE FROM auto_save WHERE project_id = ?`, projectID)
	if err != nil {
		return fmt.Errorf("delete auto_save: %w", err)
	}
	return nil
}

// GetAutoSaveInfo returns lightweight info about auto-save data without loading full transcript.
func (r *AutoSaveRepository) GetAutoSaveInfo(projectID int64) (*AutoSaveInfo, error) {
	var savedAt string
	var transcriptJSON string
	var playbackPosition int64

	err := r.db.QueryRow(`
		SELECT saved_at, transcript_json, playback_position
		FROM auto_save
		WHERE project_id = ?
	`, projectID).Scan(&savedAt, &transcriptJSON, &playbackPosition)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get auto_save info: %w", err)
	}

	info := &AutoSaveInfo{
		ProjectID:        projectID,
		PlaybackPosition: playbackPosition,
		HasData:          transcriptJSON != "",
	}

	if savedAt != "" {
		info.SavedAt, _ = time.Parse(time.RFC3339, savedAt)
	}

	if transcriptJSON != "" {
		var data map[string]interface{}
		if err := json.Unmarshal([]byte(transcriptJSON), &data); err == nil {
			if words, ok := data["words"].([]interface{}); ok {
				info.TranscriptWordCount = len(words)
			}
		}
	}

	return info, nil
}
