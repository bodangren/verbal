package db

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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

// migrate runs database migrations.
func (d *Database) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS recordings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		file_path TEXT NOT NULL,
		duration INTEGER NOT NULL DEFAULT 0,
		transcription_status TEXT NOT NULL DEFAULT 'pending',
		transcription_json TEXT NOT NULL DEFAULT '',
		thumbnail_data TEXT NOT NULL DEFAULT '',
		thumbnail_mime_type TEXT NOT NULL DEFAULT '',
		thumbnail_generated_at DATETIME NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS settings (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		active_provider TEXT NOT NULL DEFAULT 'openai',
		openai_config TEXT NOT NULL DEFAULT '{}',
		google_config TEXT NOT NULL DEFAULT '{}',
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	`

	if _, err := d.db.Exec(schema); err != nil {
		return err
	}

	// Backfill new columns on older DB files.
	if err := d.addRecordingColumnIfMissing("thumbnail_data", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := d.addRecordingColumnIfMissing("thumbnail_mime_type", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := d.addRecordingColumnIfMissing("thumbnail_generated_at", "DATETIME NULL"); err != nil {
		return err
	}

	return nil
}

func (d *Database) addRecordingColumnIfMissing(columnName, columnDef string) error {
	_, err := d.db.Exec(fmt.Sprintf("ALTER TABLE recordings ADD COLUMN %s %s", columnName, columnDef))
	if err == nil {
		return nil
	}
	// SQLite returns "duplicate column name" if this column already exists.
	if strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return nil
	}
	return fmt.Errorf("add recordings.%s column: %w", columnName, err)
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
	rec := &Recording{}
	var durationNS int64
	var thumbnailGeneratedAt sql.NullString

	err := r.db.QueryRow(`
		SELECT
			id, file_path, duration, transcription_status, transcription_json,
			thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
			created_at, updated_at
		FROM recordings
		WHERE id = ?
	`, id).Scan(
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
		return nil, fmt.Errorf("get recording by id: %w", err)
	}

	rec.Duration = time.Duration(durationNS)
	rec.ThumbnailGeneratedAt = parseThumbnailGeneratedAt(thumbnailGeneratedAt)
	return rec, nil
}

// GetByPathExact retrieves a recording by exact file path.
func (r *RecordingRepository) GetByPathExact(filePath string) (*Recording, error) {
	rec := &Recording{}
	var durationNS int64
	var thumbnailGeneratedAt sql.NullString

	err := r.db.QueryRow(`
		SELECT
			id, file_path, duration, transcription_status, transcription_json,
			thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
			created_at, updated_at
		FROM recordings
		WHERE file_path = ?
	`, filePath).Scan(
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
		return nil, fmt.Errorf("get recording by path: %w", err)
	}

	rec.Duration = time.Duration(durationNS)
	rec.ThumbnailGeneratedAt = parseThumbnailGeneratedAt(thumbnailGeneratedAt)
	return rec, nil
}

// List returns all recordings ordered by created_at descending (newest first).
func (r *RecordingRepository) List() ([]*Recording, error) {
	rows, err := r.db.Query(`
		SELECT
			id, file_path, duration, transcription_status, transcription_json,
			thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
			created_at, updated_at
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
		var thumbnailGeneratedAt sql.NullString
		if err := rows.Scan(
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
		); err != nil {
			return nil, fmt.Errorf("scan recording: %w", err)
		}
		rec.Duration = time.Duration(durationNS)
		rec.ThumbnailGeneratedAt = parseThumbnailGeneratedAt(thumbnailGeneratedAt)
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

// SearchByTranscription searches recordings by transcription content.
func (r *RecordingRepository) SearchByTranscription(query string) ([]*Recording, error) {
	likeQuery := "%" + query + "%"

	rows, err := r.db.Query(`
		SELECT
			id, file_path, duration, transcription_status, transcription_json,
			thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
			created_at, updated_at
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
		var thumbnailGeneratedAt sql.NullString
		if err := rows.Scan(
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
		); err != nil {
			return nil, fmt.Errorf("scan recording: %w", err)
		}
		rec.Duration = time.Duration(durationNS)
		rec.ThumbnailGeneratedAt = parseThumbnailGeneratedAt(thumbnailGeneratedAt)
		recordings = append(recordings, rec)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recordings: %w", err)
	}

	return recordings, nil
}

// ListRecent returns the most recent recordings up to the specified limit.
func (r *RecordingRepository) ListRecent(limit int) ([]*Recording, error) {
	rows, err := r.db.Query(`
		SELECT
			id, file_path, duration, transcription_status, transcription_json,
			thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
			created_at, updated_at
		FROM recordings
		ORDER BY created_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent recordings: %w", err)
	}
	defer rows.Close()

	var recordings []*Recording
	for rows.Next() {
		rec := &Recording{}
		var durationNS int64
		var thumbnailGeneratedAt sql.NullString
		if err := rows.Scan(
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
		); err != nil {
			return nil, fmt.Errorf("scan recording: %w", err)
		}
		rec.Duration = time.Duration(durationNS)
		rec.ThumbnailGeneratedAt = parseThumbnailGeneratedAt(thumbnailGeneratedAt)
		recordings = append(recordings, rec)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recordings: %w", err)
	}

	return recordings, nil
}

// SearchByPath searches recordings by file path (case-insensitive LIKE search).
func (r *RecordingRepository) SearchByPath(query string) ([]*Recording, error) {
	likeQuery := "%" + query + "%"

	rows, err := r.db.Query(`
		SELECT
			id, file_path, duration, transcription_status, transcription_json,
			thumbnail_data, thumbnail_mime_type, thumbnail_generated_at,
			created_at, updated_at
		FROM recordings
		WHERE file_path LIKE ?
		ORDER BY created_at DESC
	`, likeQuery)
	if err != nil {
		return nil, fmt.Errorf("search recordings by path: %w", err)
	}
	defer rows.Close()

	var recordings []*Recording
	for rows.Next() {
		rec := &Recording{}
		var durationNS int64
		var thumbnailGeneratedAt sql.NullString
		if err := rows.Scan(
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
		); err != nil {
			return nil, fmt.Errorf("scan recording: %w", err)
		}
		rec.Duration = time.Duration(durationNS)
		rec.ThumbnailGeneratedAt = parseThumbnailGeneratedAt(thumbnailGeneratedAt)
		recordings = append(recordings, rec)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recordings: %w", err)
	}

	return recordings, nil
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
