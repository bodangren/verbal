package db

import (
	"path/filepath"
	"testing"

	"verbal/internal/settings"
)

func TestSettingsRepository_CreateSettingsSchema(t *testing.T) {
	db := setupTestDB(t)
	defer teardownTestDB(t, db)

	repo := db.SettingsRepo()

	err := repo.CreateSettingsSchema()
	if err != nil {
		t.Errorf("CreateSettingsSchema() error = %v", err)
	}

	// Verify schema was created by checking if we can access the table
	_, err = repo.HasSettings()
	if err != nil {
		t.Errorf("HasSettings() after schema creation error = %v", err)
	}
}

func TestSettingsRepository_SaveAndGetSettings(t *testing.T) {
	db := setupTestDB(t)
	defer teardownTestDB(t, db)

	repo := db.SettingsRepo()

	// Create schema
	if err := repo.CreateSettingsSchema(); err != nil {
		t.Fatalf("CreateSettingsSchema() error = %v", err)
	}

	// Test saving and retrieving OpenAI settings
	openAISettings := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI: &settings.OpenAIConfig{
			APIKey: "sk-test-openai-key",
			Model:  "whisper-1",
		},
		Google: &settings.GoogleConfig{},
	}

	if err := repo.SaveSettings(openAISettings); err != nil {
		t.Errorf("SaveSettings() error = %v", err)
	}

	retrieved, err := repo.GetSettings()
	if err != nil {
		t.Errorf("GetSettings() error = %v", err)
	}

	if retrieved.ActiveProvider != settings.ProviderOpenAI {
		t.Errorf("ActiveProvider = %v, want %v", retrieved.ActiveProvider, settings.ProviderOpenAI)
	}
	if retrieved.OpenAI.APIKey != "sk-test-openai-key" {
		t.Errorf("OpenAI.APIKey = %v, want %v", retrieved.OpenAI.APIKey, "sk-test-openai-key")
	}
	if retrieved.OpenAI.Model != "whisper-1" {
		t.Errorf("OpenAI.Model = %v, want %v", retrieved.OpenAI.Model, "whisper-1")
	}

	// Test updating to Google settings
	googleSettings := &settings.Settings{
		ActiveProvider: settings.ProviderGoogle,
		OpenAI:         &settings.OpenAIConfig{},
		Google: &settings.GoogleConfig{
			APIKey: "google-test-key",
		},
	}

	if err := repo.SaveSettings(googleSettings); err != nil {
		t.Errorf("SaveSettings() update error = %v", err)
	}

	retrieved, err = repo.GetSettings()
	if err != nil {
		t.Errorf("GetSettings() after update error = %v", err)
	}

	if retrieved.ActiveProvider != settings.ProviderGoogle {
		t.Errorf("ActiveProvider after update = %v, want %v", retrieved.ActiveProvider, settings.ProviderGoogle)
	}
	if retrieved.Google.APIKey != "google-test-key" {
		t.Errorf("Google.APIKey = %v, want %v", retrieved.Google.APIKey, "google-test-key")
	}
}

func TestSettingsRepository_GetSettings_Default(t *testing.T) {
	db := setupTestDB(t)
	defer teardownTestDB(t, db)

	repo := db.SettingsRepo()

	// Create schema
	if err := repo.CreateSettingsSchema(); err != nil {
		t.Fatalf("CreateSettingsSchema() error = %v", err)
	}

	// Get settings when none exist - should return defaults
	retrieved, err := repo.GetSettings()
	if err != nil {
		t.Errorf("GetSettings() error = %v", err)
	}

	if retrieved.ActiveProvider != settings.ProviderOpenAI {
		t.Errorf("Default ActiveProvider = %v, want %v", retrieved.ActiveProvider, settings.ProviderOpenAI)
	}
	if retrieved.OpenAI == nil {
		t.Error("Default OpenAI config should not be nil")
	}
	if retrieved.Google == nil {
		t.Error("Default Google config should not be nil")
	}
}

func TestSettingsRepository_HasSettings(t *testing.T) {
	db := setupTestDB(t)
	defer teardownTestDB(t, db)

	repo := db.SettingsRepo()

	// Create schema
	if err := repo.CreateSettingsSchema(); err != nil {
		t.Fatalf("CreateSettingsSchema() error = %v", err)
	}

	// Initially should not have settings
	has, err := repo.HasSettings()
	if err != nil {
		t.Errorf("HasSettings() error = %v", err)
	}
	if has {
		t.Error("HasSettings() should return false when no settings exist")
	}

	// Save settings
	settings := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI: &settings.OpenAIConfig{
			APIKey: "test-key",
			Model:  "whisper-1",
		},
	}
	if err := repo.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings() error = %v", err)
	}

	// Now should have settings
	has, err = repo.HasSettings()
	if err != nil {
		t.Errorf("HasSettings() after save error = %v", err)
	}
	if !has {
		t.Error("HasSettings() should return true after saving settings")
	}
}

func TestSettingsRepository_DeleteSettings(t *testing.T) {
	db := setupTestDB(t)
	defer teardownTestDB(t, db)

	repo := db.SettingsRepo()

	// Create schema
	if err := repo.CreateSettingsSchema(); err != nil {
		t.Fatalf("CreateSettingsSchema() error = %v", err)
	}

	// Save settings
	s := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI: &settings.OpenAIConfig{
			APIKey: "test-key",
			Model:  "whisper-1",
		},
	}
	if err := repo.SaveSettings(s); err != nil {
		t.Fatalf("SaveSettings() error = %v", err)
	}

	// Verify settings exist
	has, _ := repo.HasSettings()
	if !has {
		t.Fatal("Settings should exist before deletion")
	}

	// Delete settings
	if err := repo.DeleteSettings(); err != nil {
		t.Errorf("DeleteSettings() error = %v", err)
	}

	// Verify settings don't exist
	has, _ = repo.HasSettings()
	if has {
		t.Error("Settings should not exist after deletion")
	}
}

func TestSettingsRepository_recordToSettings_InvalidJSON(t *testing.T) {
	repo := &SettingsRepository{}

	record := &SettingsRecord{
		ActiveProvider: "openai",
		OpenAIConfig:   "invalid json",
		GoogleConfig:   "{}",
	}

	_, err := repo.recordToSettings(record)
	if err == nil {
		t.Error("recordToSettings() should error with invalid JSON")
	}
}

func TestSettingsRepository_settingsToRecord_NilConfigs(t *testing.T) {
	repo := &SettingsRepository{}

	s := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI:         nil,
		Google:         nil,
	}

	record, err := repo.settingsToRecord(s)
	if err != nil {
		t.Errorf("settingsToRecord() error = %v", err)
	}

	if record.OpenAIConfig != "{}" {
		t.Errorf("OpenAIConfig = %v, want empty JSON object", record.OpenAIConfig)
	}
	if record.GoogleConfig != "{}" {
		t.Errorf("GoogleConfig = %v, want empty JSON object", record.GoogleConfig)
	}
}

// setupTestDB creates a temporary database for testing.
func setupTestDB(t *testing.T) *Database {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}

	return db
}

// teardownTestDB closes and removes the test database.
func teardownTestDB(t *testing.T, db *Database) {
	t.Helper()
	if err := db.Close(); err != nil {
		t.Errorf("Failed to close test database: %v", err)
	}
}

// TestDatabase_SettingsRepo verifies SettingsRepo returns a valid repository.
func TestDatabase_SettingsRepo(t *testing.T) {
	db := setupTestDB(t)
	defer teardownTestDB(t, db)

	repo := db.SettingsRepo()
	if repo == nil {
		t.Error("SettingsRepo() returned nil")
	}
	if repo.db == nil {
		t.Error("SettingsRepo() returned repository with nil db")
	}
}

// TestSettingsRepository_SaveSettings_InvalidProvider(t *testing.T) {
func TestSettingsRepository_SaveSettings_InvalidProvider(t *testing.T) {
	db := setupTestDB(t)
	defer teardownTestDB(t, db)

	repo := db.SettingsRepo()

	// Create schema
	if err := repo.CreateSettingsSchema(); err != nil {
		t.Fatalf("CreateSettingsSchema() error = %v", err)
	}

	// Try to save settings with invalid provider
	invalidSettings := &settings.Settings{
		ActiveProvider: "invalid",
		OpenAI:         &settings.OpenAIConfig{},
		Google:         &settings.GoogleConfig{},
	}

	// This should succeed at the repository level (validation is service layer)
	if err := repo.SaveSettings(invalidSettings); err != nil {
		t.Errorf("SaveSettings() with invalid provider should not error at repo level: %v", err)
	}

	// Verify it was saved
	retrieved, err := repo.GetSettings()
	if err != nil {
		t.Errorf("GetSettings() error = %v", err)
	}

	if retrieved.ActiveProvider != "invalid" {
		t.Errorf("ActiveProvider = %v, want invalid", retrieved.ActiveProvider)
	}
}

// TestSettingsRepository_EmptyAPIKeys tests saving settings with empty API keys.
func TestSettingsRepository_EmptyAPIKeys(t *testing.T) {
	db := setupTestDB(t)
	defer teardownTestDB(t, db)

	repo := db.SettingsRepo()

	// Create schema
	if err := repo.CreateSettingsSchema(); err != nil {
		t.Fatalf("CreateSettingsSchema() error = %v", err)
	}

	// Save settings with empty API keys
	s := &settings.Settings{
		ActiveProvider: settings.ProviderOpenAI,
		OpenAI: &settings.OpenAIConfig{
			APIKey: "",
			Model:  "whisper-1",
		},
		Google: &settings.GoogleConfig{
			APIKey: "",
		},
	}

	if err := repo.SaveSettings(s); err != nil {
		t.Errorf("SaveSettings() with empty keys error = %v", err)
	}

	retrieved, err := repo.GetSettings()
	if err != nil {
		t.Errorf("GetSettings() error = %v", err)
	}

	if retrieved.OpenAI.APIKey != "" {
		t.Errorf("OpenAI.APIKey = %v, want empty", retrieved.OpenAI.APIKey)
	}
	if retrieved.Google.APIKey != "" {
		t.Errorf("Google.APIKey = %v, want empty", retrieved.Google.APIKey)
	}
}
