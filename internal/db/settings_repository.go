package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"verbal/internal/settings"
)

// SettingsRepository provides CRUD operations for application settings.
type SettingsRepository struct {
	db *sql.DB
}

// SettingsRecord represents the raw database record for settings.
type SettingsRecord struct {
	ID             int64     `json:"id"`
	ActiveProvider string    `json:"active_provider"`
	OpenAIConfig   string    `json:"openai_config"`
	GoogleConfig   string    `json:"google_config"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// CreateSettingsSchema creates the settings table if it doesn't exist.
func (r *SettingsRepository) CreateSettingsSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS settings (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		active_provider TEXT NOT NULL DEFAULT 'openai',
		openai_config TEXT NOT NULL DEFAULT '{}',
		google_config TEXT NOT NULL DEFAULT '{}',
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err := r.db.Exec(schema)
	if err != nil {
		return fmt.Errorf("create settings schema: %w", err)
	}

	return nil
}

// GetSettings retrieves the application settings from the database.
// Returns default settings if no settings record exists.
func (r *SettingsRepository) GetSettings() (*settings.Settings, error) {
	record := &SettingsRecord{}

	err := r.db.QueryRow(`
		SELECT id, active_provider, openai_config, google_config, updated_at
		FROM settings
		WHERE id = 1
	`).Scan(&record.ID, &record.ActiveProvider, &record.OpenAIConfig, &record.GoogleConfig, &record.UpdatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			// Return default settings
			return &settings.Settings{
				ActiveProvider: settings.ProviderOpenAI,
				OpenAI:         &settings.OpenAIConfig{},
				Google:         &settings.GoogleConfig{},
			}, nil
		}
		return nil, fmt.Errorf("get settings: %w", err)
	}

	return r.recordToSettings(record)
}

// SaveSettings saves the application settings to the database.
// Uses INSERT OR REPLACE to handle both create and update operations.
func (r *SettingsRepository) SaveSettings(s *settings.Settings) error {
	record, err := r.settingsToRecord(s)
	if err != nil {
		return err
	}

	record.UpdatedAt = time.Now()

	_, err = r.db.Exec(`
		INSERT INTO settings (id, active_provider, openai_config, google_config, updated_at)
		VALUES (1, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			active_provider = excluded.active_provider,
			openai_config = excluded.openai_config,
			google_config = excluded.google_config,
			updated_at = excluded.updated_at
	`, record.ActiveProvider, record.OpenAIConfig, record.GoogleConfig, record.UpdatedAt)

	if err != nil {
		return fmt.Errorf("save settings: %w", err)
	}

	return nil
}

// HasSettings returns true if settings have been saved to the database.
func (r *SettingsRepository) HasSettings() (bool, error) {
	var count int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM settings WHERE id = 1`).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check settings existence: %w", err)
	}
	return count > 0, nil
}

// DeleteSettings removes the settings record from the database.
func (r *SettingsRepository) DeleteSettings() error {
	_, err := r.db.Exec(`DELETE FROM settings WHERE id = 1`)
	if err != nil {
		return fmt.Errorf("delete settings: %w", err)
	}
	return nil
}

// recordToSettings converts a database record to a settings.Settings struct.
func (r *SettingsRepository) recordToSettings(record *SettingsRecord) (*settings.Settings, error) {
	s := &settings.Settings{
		ActiveProvider: settings.ProviderType(record.ActiveProvider),
	}

	// Parse OpenAI config
	if record.OpenAIConfig != "" && record.OpenAIConfig != "{}" {
		var openaiConfig settings.OpenAIConfig
		if err := json.Unmarshal([]byte(record.OpenAIConfig), &openaiConfig); err != nil {
			return nil, fmt.Errorf("parse openai config: %w", err)
		}
		s.OpenAI = &openaiConfig
	} else {
		s.OpenAI = &settings.OpenAIConfig{}
	}

	// Parse Google config
	if record.GoogleConfig != "" && record.GoogleConfig != "{}" {
		var googleConfig settings.GoogleConfig
		if err := json.Unmarshal([]byte(record.GoogleConfig), &googleConfig); err != nil {
			return nil, fmt.Errorf("parse google config: %w", err)
		}
		s.Google = &googleConfig
	} else {
		s.Google = &settings.GoogleConfig{}
	}

	return s, nil
}

// settingsToRecord converts a settings.Settings struct to a database record.
func (r *SettingsRepository) settingsToRecord(s *settings.Settings) (*SettingsRecord, error) {
	record := &SettingsRecord{
		ActiveProvider: string(s.ActiveProvider),
	}

	// Serialize OpenAI config
	if s.OpenAI != nil {
		openaiJSON, err := json.Marshal(s.OpenAI)
		if err != nil {
			return nil, fmt.Errorf("serialize openai config: %w", err)
		}
		record.OpenAIConfig = string(openaiJSON)
	} else {
		record.OpenAIConfig = "{}"
	}

	// Serialize Google config
	if s.Google != nil {
		googleJSON, err := json.Marshal(s.Google)
		if err != nil {
			return nil, fmt.Errorf("serialize google config: %w", err)
		}
		record.GoogleConfig = string(googleJSON)
	} else {
		record.GoogleConfig = "{}"
	}

	return record, nil
}

// SettingsRepo returns a SettingsRepository for CRUD operations.
func (d *Database) SettingsRepo() *SettingsRepository {
	return &SettingsRepository{db: d.db}
}
