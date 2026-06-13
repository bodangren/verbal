package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// PresetContainer* constants define the allowed container formats for presets.
const (
	PresetContainerMP4  = "mp4"
	PresetContainerMKV  = "mkv"
	PresetContainerWebM = "webm"
	PresetContainerWAV  = "wav"
	PresetContainerM4A  = "m4a"
)

// validContainers is the set of allowed container format strings.
var validContainers = map[string]bool{
	PresetContainerMP4:  true,
	PresetContainerMKV:  true,
	PresetContainerWebM: true,
	PresetContainerWAV:  true,
	PresetContainerM4A:  true,
}

// Preset represents an export preset configuration.
type Preset struct {
	ID          int64
	Name        string
	Container   string
	VideoCodec  string
	AudioCodec  string
	Bitrate     int64
	Width       int
	Height      int
	IsBuiltin   bool
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// PresetRepository provides CRUD operations for export presets.
type PresetRepository struct {
	db *sql.DB
}

// presetColumns is the standard SELECT column list for preset queries.
const presetColumns = `id, name, container, video_codec, audio_codec, bitrate, width, height, is_builtin, description, created_at, updated_at`

// scanPreset scans a single row into a Preset struct.
func scanPreset(s scanner) (*Preset, error) {
	p := &Preset{}
	var createdAt, updatedAt string
	var isBuiltin int

	err := s.Scan(
		&p.ID,
		&p.Name,
		&p.Container,
		&p.VideoCodec,
		&p.AudioCodec,
		&p.Bitrate,
		&p.Width,
		&p.Height,
		&isBuiltin,
		&p.Description,
		&createdAt,
		&updatedAt,
	)
	if err != nil {
		return nil, err
	}

	p.IsBuiltin = isBuiltin != 0
	if createdAt != "" {
		p.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	}
	if updatedAt != "" {
		p.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	}

	return p, nil
}

// PresetRepo returns a PresetRepository for CRUD operations.
func (d *Database) PresetRepo() *PresetRepository {
	return &PresetRepository{db: d.db}
}

// Create inserts a new preset into the database. It validates the preset
// fields and rejects invalid or duplicate entries.
func (r *PresetRepository) Create(p *Preset) (*Preset, error) {
	if err := validatePreset(p); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now

	isBuiltin := 0
	if p.IsBuiltin {
		isBuiltin = 1
	}

	result, err := r.db.Exec(`
		INSERT INTO export_presets (name, container, video_codec, audio_codec, bitrate, width, height, is_builtin, description, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		p.Name,
		p.Container,
		p.VideoCodec,
		p.AudioCodec,
		p.Bitrate,
		p.Width,
		p.Height,
		isBuiltin,
		p.Description,
		p.CreatedAt.Format(time.RFC3339),
		p.UpdatedAt.Format(time.RFC3339),
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			return nil, fmt.Errorf("create preset: duplicate name %q", p.Name)
		}
		return nil, fmt.Errorf("create preset: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("create preset: get last insert id: %w", err)
	}

	p.ID = id
	return p, nil
}

// GetByID retrieves a preset by its ID.
func (r *PresetRepository) GetByID(id int64) (*Preset, error) {
	p, err := scanPreset(r.db.QueryRow(`
		SELECT `+presetColumns+`
		FROM export_presets
		WHERE id = ?
	`, id))
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("get preset by id: not found (id=%d)", id)
		}
		return nil, fmt.Errorf("get preset by id: %w", err)
	}
	return p, nil
}

// GetByName retrieves a preset by its unique name.
func (r *PresetRepository) GetByName(name string) (*Preset, error) {
	p, err := scanPreset(r.db.QueryRow(`
		SELECT `+presetColumns+`
		FROM export_presets
		WHERE name = ?
	`, name))
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("get preset by name: not found (%q)", name)
		}
		return nil, fmt.Errorf("get preset by name: %w", err)
	}
	return p, nil
}

// List returns all presets ordered with built-ins first, then custom presets
// sorted by name ascending.
func (r *PresetRepository) List() ([]*Preset, error) {
	rows, err := r.db.Query(`
		SELECT ` + presetColumns + `
		FROM export_presets
		ORDER BY is_builtin DESC, name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list presets: %w", err)
	}
	defer rows.Close()

	var presets []*Preset
	for rows.Next() {
		p, err := scanPreset(rows)
		if err != nil {
			return nil, fmt.Errorf("list presets: scan: %w", err)
		}
		presets = append(presets, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list presets: iterate: %w", err)
	}

	return presets, nil
}

// Update modifies an existing preset. It rejects updates to built-in presets
// unless the caller explicitly sets IsBuiltin=false (converting a built-in to a
// custom preset, which is the only allowed mutation on a built-in row).
func (r *PresetRepository) Update(p *Preset) error {
	existing, err := r.GetByID(p.ID)
	if err != nil {
		return fmt.Errorf("update preset: %w", err)
	}
	if existing.IsBuiltin && p.IsBuiltin {
		return fmt.Errorf("update preset: built-in presets are immutable")
	}

	if err := validatePreset(p); err != nil {
		return fmt.Errorf("update preset: %w", err)
	}

	p.UpdatedAt = time.Now().UTC()

	_, err = r.db.Exec(`
		UPDATE export_presets
		SET name = ?, container = ?, video_codec = ?, audio_codec = ?,
		    bitrate = ?, width = ?, height = ?, is_builtin = ?,
		    description = ?, updated_at = ?
		WHERE id = ?
	`,
		p.Name,
		p.Container,
		p.VideoCodec,
		p.AudioCodec,
		p.Bitrate,
		p.Width,
		p.Height,
		boolToInt(p.IsBuiltin),
		p.Description,
		p.UpdatedAt.Format(time.RFC3339),
		p.ID,
	)
	if err != nil {
		return fmt.Errorf("update preset: %w", err)
	}

	return nil
}

// Delete removes a preset by ID. It rejects deletion of built-in presets.
func (r *PresetRepository) Delete(id int64) error {
	existing, err := r.GetByID(id)
	if err != nil {
		return fmt.Errorf("delete preset: %w", err)
	}
	if existing.IsBuiltin {
		return fmt.Errorf("delete preset: built-in presets are immutable")
	}

	_, err = r.db.Exec(`DELETE FROM export_presets WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete preset: %w", err)
	}

	return nil
}

// SeedBuiltins inserts the built-in presets if they do not already exist.
// It uses INSERT OR IGNORE to be idempotent and will not overwrite user-edited
// rows that share a built-in name.
func (r *PresetRepository) SeedBuiltins() error {
	for _, p := range BuiltinPresetsForTest() {
		_, err := r.db.Exec(`
			INSERT OR IGNORE INTO export_presets (name, container, video_codec, audio_codec, bitrate, width, height, is_builtin, description, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
		`,
			p.Name,
			p.Container,
			p.VideoCodec,
			p.AudioCodec,
			p.Bitrate,
			p.Width,
			p.Height,
			p.Description,
			time.Now().UTC().Format(time.RFC3339),
			time.Now().UTC().Format(time.RFC3339),
		)
		if err != nil {
			return fmt.Errorf("seed builtins: %w", err)
		}
	}
	return nil
}

// BuiltinPresetsForTest returns the golden table of built-in presets used by
// SeedBuiltins and test assertions. It includes YouTube 1080p, Podcast Audio,
// Archive (lossless), and Web Preview.
func BuiltinPresetsForTest() []Preset {
	return []Preset{
		{
			Name:        "YouTube 1080p",
			Container:   PresetContainerMP4,
			VideoCodec:  "h264",
			AudioCodec:  "aac",
			Bitrate:     8_000_000,
			Width:       1920,
			Height:      1080,
			IsBuiltin:   true,
			Description: "Optimized for YouTube upload at 1080p",
		},
		{
			Name:        "Podcast Audio",
			Container:   PresetContainerM4A,
			VideoCodec:  "",
			AudioCodec:  "aac",
			Bitrate:     128_000,
			Width:       1920,
			Height:      1080,
			IsBuiltin:   true,
			Description: "Audio-only preset for podcast export",
		},
		{
			Name:        "Archive",
			Container:   PresetContainerMKV,
			VideoCodec:  "h264",
			AudioCodec:  "flac",
			Bitrate:     20_000_000,
			Width:       1920,
			Height:      1080,
			IsBuiltin:   true,
			Description: "Lossless archival quality",
		},
		{
			Name:        "Web Preview",
			Container:   PresetContainerWebM,
			VideoCodec:  "vp9",
			AudioCodec:  "opus",
			Bitrate:     2_000_000,
			Width:       1280,
			Height:      720,
			IsBuiltin:   true,
			Description: "Lightweight web-optimized preview",
		},
	}
}

// validatePreset checks the preset fields at the repository boundary.
func validatePreset(p *Preset) error {
	name := strings.TrimSpace(p.Name)
	if name == "" {
		return fmt.Errorf("validate preset: name must not be empty or whitespace")
	}
	if strings.ContainsAny(p.Name, "\n\r") {
		return fmt.Errorf("validate preset: name must not contain embedded control characters")
	}
	if !validContainers[p.Container] {
		return fmt.Errorf("validate preset: invalid container %q (allowed: mp4, mkv, webm, wav, m4a)", p.Container)
	}
	if p.Bitrate <= 0 {
		return fmt.Errorf("validate preset: bitrate must be positive (got %d)", p.Bitrate)
	}
	return nil
}

// boolToInt converts a bool to 1/0 for SQLite.
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
