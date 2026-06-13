package db

import (
	"path/filepath"
	"testing"

	"verbal/internal/settings"
)

func TestSettingsRepository_RecordToSettings_InvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.SettingsRepo()
	record := &SettingsRecord{
		ActiveProvider: "openai",
		OpenAIConfig:   "not-json",
		GoogleConfig:   "{}",
		LocalConfig:    "{}",
	}
	_, err = repo.recordToSettings(record)
	if err == nil {
		t.Fatal("expected error for invalid OpenAI config JSON")
	}

	record.OpenAIConfig = "{}"
	record.GoogleConfig = "not-json"
	_, err = repo.recordToSettings(record)
	if err == nil {
		t.Fatal("expected error for invalid Google config JSON")
	}

	record.GoogleConfig = "{}"
	record.LocalConfig = "not-json"
	_, err = repo.recordToSettings(record)
	if err == nil {
		t.Fatal("expected error for invalid Local config JSON")
	}
}

func TestSettingsRepository_SettingsToRecord_NilConfigs(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.SettingsRepo()
	s := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
	}
	record, err := repo.settingsToRecord(s)
	if err != nil {
		t.Fatalf("settingsToRecord() error = %v", err)
	}
	if record.OpenAIConfig != "{}" {
		t.Errorf("OpenAIConfig = %q, want %q", record.OpenAIConfig, "{}")
	}
	if record.GoogleConfig != "{}" {
		t.Errorf("GoogleConfig = %q, want %q", record.GoogleConfig, "{}")
	}
	if record.LocalConfig != "{}" {
		t.Errorf("LocalConfig = %q, want %q", record.LocalConfig, "{}")
	}
}

func TestSettingsRepository_CreateSettingsSchema_Edge(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.SettingsRepo()
	if err := repo.CreateSettingsSchema(); err != nil {
		t.Fatalf("CreateSettingsSchema() error = %v", err)
	}
	// Idempotent
	if err := repo.CreateSettingsSchema(); err != nil {
		t.Fatalf("CreateSettingsSchema() idempotent error = %v", err)
	}
}
