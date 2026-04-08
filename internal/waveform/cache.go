package waveform

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Cache provides persistent storage for waveform data.
type Cache struct {
	db *sql.DB
}

// NewCache creates a new waveform cache using the provided database connection.
func NewCache(db *sql.DB) (*Cache, error) {
	if db == nil {
		return nil, fmt.Errorf("database connection is nil")
	}

	c := &Cache{db: db}
	if err := c.migrate(); err != nil {
		return nil, fmt.Errorf("failed to migrate cache schema: %w", err)
	}

	return c, nil
}

// migrate creates the waveform cache table if it doesn't exist.
func (c *Cache) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS waveforms (
		file_path TEXT PRIMARY KEY,
		duration_ns INTEGER NOT NULL,
		sample_rate INTEGER NOT NULL,
		samples_json TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_waveforms_path ON waveforms(file_path);
	`

	_, err := c.db.Exec(schema)
	return err
}

// Get retrieves waveform data for a given file path.
// Returns nil if no cached data exists.
func (c *Cache) Get(filePath string) (*Data, error) {
	row := c.db.QueryRow(`
		SELECT file_path, duration_ns, sample_rate, samples_json, created_at
		FROM waveforms
		WHERE file_path = ?
	`, filePath)

	var data Data
	var durationNS int64
	var samplesJSON string
	var createdAtStr string

	err := row.Scan(&data.FilePath, &durationNS, &data.SampleRate, &samplesJSON, &createdAtStr)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get waveform: %w", err)
	}

	data.Duration = time.Duration(durationNS)
	data.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)

	// Parse samples JSON
	if err := json.Unmarshal([]byte(samplesJSON), &data.Samples); err != nil {
		return nil, fmt.Errorf("failed to unmarshal samples: %w", err)
	}

	return &data, nil
}

// Set stores waveform data in the cache.
func (c *Cache) Set(data *Data) error {
	if data == nil {
		return fmt.Errorf("data is nil")
	}

	if data.FilePath == "" {
		return fmt.Errorf("file path is empty")
	}

	// Serialize samples to JSON
	samplesJSON, err := json.Marshal(data.Samples)
	if err != nil {
		return fmt.Errorf("failed to marshal samples: %w", err)
	}

	_, err = c.db.Exec(`
		INSERT INTO waveforms (file_path, duration_ns, sample_rate, samples_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(file_path) DO UPDATE SET
			duration_ns = excluded.duration_ns,
			sample_rate = excluded.sample_rate,
			samples_json = excluded.samples_json,
			updated_at = excluded.updated_at
	`, data.FilePath, data.Duration.Nanoseconds(), data.SampleRate, string(samplesJSON), data.CreatedAt, time.Now())

	if err != nil {
		return fmt.Errorf("failed to store waveform: %w", err)
	}

	return nil
}

// Delete removes waveform data from the cache.
func (c *Cache) Delete(filePath string) error {
	_, err := c.db.Exec(`DELETE FROM waveforms WHERE file_path = ?`, filePath)
	if err != nil {
		return fmt.Errorf("failed to delete waveform: %w", err)
	}
	return nil
}

// Exists checks if waveform data exists for a given file path.
func (c *Cache) Exists(filePath string) (bool, error) {
	var count int
	err := c.db.QueryRow(`SELECT COUNT(*) FROM waveforms WHERE file_path = ?`, filePath).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check existence: %w", err)
	}
	return count > 0, nil
}

// Clear removes all cached waveform data.
func (c *Cache) Clear() error {
	_, err := c.db.Exec(`DELETE FROM waveforms`)
	if err != nil {
		return fmt.Errorf("failed to clear cache: %w", err)
	}
	return nil
}

// Stats returns statistics about the cache.
func (c *Cache) Stats() (entryCount int, totalSize int64, err error) {
	err = c.db.QueryRow(`SELECT COUNT(*) FROM waveforms`).Scan(&entryCount)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get entry count: %w", err)
	}

	// Estimate size by summing JSON lengths
	var totalSizePtr *int64
	err = c.db.QueryRow(`SELECT SUM(LENGTH(samples_json)) FROM waveforms`).Scan(&totalSizePtr)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get total size: %w", err)
	}

	if totalSizePtr != nil {
		totalSize = *totalSizePtr
	}

	return entryCount, totalSize, nil
}

// GetOrGenerate retrieves cached waveform data or generates it if not cached.
// This is a convenience method that combines cache lookup with generation.
func (c *Cache) GetOrGenerate(
	filePath string,
	generator *Generator,
	onProgress func(float64),
) (*Data, error) {
	// Try cache first
	data, err := c.Get(filePath)
	if err != nil {
		return nil, fmt.Errorf("cache lookup failed: %w", err)
	}

	if data != nil {
		// Report progress completion for cached data
		if onProgress != nil {
			onProgress(1.0)
		}
		return data, nil
	}

	// Generate new waveform
	if onProgress != nil {
		onProgress(0.0)
	}

	data, err = generator.Generate(filePath)
	if err != nil {
		return nil, fmt.Errorf("generation failed: %w", err)
	}

	// Store in cache
	if err := c.Set(data); err != nil {
		// Log but don't fail - we still have the data
		// In a real implementation, this might be logged
		_ = err
	}

	if onProgress != nil {
		onProgress(1.0)
	}

	return data, nil
}
