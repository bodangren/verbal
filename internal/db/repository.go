package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// Recording represents a video/audio recording in the database.
type Recording struct {
	ID                  int64
	FilePath            string
	Duration            time.Duration
	TranscriptionStatus string
	TranscriptionJSON   string
	CreatedAt           time.Time
	UpdatedAt           time.Time
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

// RecordingRepo returns a RecordingRepository for CRUD operations.
func (d *Database) RecordingRepo() *RecordingRepository {
	return &RecordingRepository{db: d.db}
}

// migrate runs database migrations.
func (d *Database) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS recordings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		file_path TEXT NOT NULL,
		duration INTEGER NOT NULL DEFAULT 0,
		transcription_status TEXT NOT NULL DEFAULT 'pending',
		transcription_json TEXT NOT NULL DEFAULT '',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err := d.db.Exec(schema)
	return err
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
		INSERT INTO recordings (file_path, duration, transcription_status, transcription_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, rec.FilePath, rec.Duration.Nanoseconds(), rec.TranscriptionStatus, rec.TranscriptionJSON, rec.CreatedAt, rec.UpdatedAt)
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
	rec := &Recording{}
	var durationNS int64

	err := r.db.QueryRow(`
		SELECT id, file_path, duration, transcription_status, transcription_json, created_at, updated_at
		FROM recordings
		WHERE id = ?
	`, id).Scan(&rec.ID, &rec.FilePath, &durationNS, &rec.TranscriptionStatus, &rec.TranscriptionJSON, &rec.CreatedAt, &rec.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get recording by id: %w", err)
	}

	rec.Duration = time.Duration(durationNS)
	return rec, nil
}

// List returns all recordings ordered by created_at descending (newest first).
func (r *RecordingRepository) List() ([]*Recording, error) {
	rows, err := r.db.Query(`
		SELECT id, file_path, duration, transcription_status, transcription_json, created_at, updated_at
		FROM recordings
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list recordings: %w", err)
	}
	defer rows.Close()

	var recordings []*Recording
	for rows.Next() {
		rec := &Recording{}
		var durationNS int64
		if err := rows.Scan(&rec.ID, &rec.FilePath, &durationNS, &rec.TranscriptionStatus, &rec.TranscriptionJSON, &rec.CreatedAt, &rec.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan recording: %w", err)
		}
		rec.Duration = time.Duration(durationNS)
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
		SET file_path = ?, duration = ?, transcription_status = ?, transcription_json = ?, updated_at = ?
		WHERE id = ?
	`, rec.FilePath, rec.Duration.Nanoseconds(), rec.TranscriptionStatus, rec.TranscriptionJSON, rec.UpdatedAt, rec.ID)
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

// SearchByTranscription searches recordings by transcription content.
func (r *RecordingRepository) SearchByTranscription(query string) ([]*Recording, error) {
	likeQuery := "%" + query + "%"

	rows, err := r.db.Query(`
		SELECT id, file_path, duration, transcription_status, transcription_json, created_at, updated_at
		FROM recordings
		WHERE transcription_json LIKE ?
		ORDER BY created_at DESC
	`, likeQuery)
	if err != nil {
		return nil, fmt.Errorf("search recordings: %w", err)
	}
	defer rows.Close()

	var recordings []*Recording
	for rows.Next() {
		rec := &Recording{}
		var durationNS int64
		if err := rows.Scan(&rec.ID, &rec.FilePath, &durationNS, &rec.TranscriptionStatus, &rec.TranscriptionJSON, &rec.CreatedAt, &rec.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan recording: %w", err)
		}
		rec.Duration = time.Duration(durationNS)
		recordings = append(recordings, rec)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recordings: %w", err)
	}

	return recordings, nil
}
