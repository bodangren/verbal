package db

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// TestMigrate_OldSchemaWithoutColumns verifies that the migration system can
// upgrade a database that has the original recordings table but is missing
// the columns added by later migrations.
func TestMigrate_OldSchemaWithoutColumns(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	// Simulate an older database with only the base recordings table.
	if _, err := db.Exec(`
		CREATE TABLE recordings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL DEFAULT '',
			file_path TEXT NOT NULL,
			duration INTEGER NOT NULL DEFAULT 0,
			transcription_status TEXT NOT NULL DEFAULT 'pending',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`); err != nil {
		t.Fatalf("create old recordings table: %v", err)
	}

	if err := Migrate(db); err != nil {
		t.Fatalf("Migrate() error = %v", err)
	}

	// Verify schema_migrations recorded all versions.
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if count != len(migrations) {
		t.Errorf("Expected %d applied migrations, got %d", len(migrations), count)
	}

	// Verify the missing columns were added.
	_, err = db.Exec(`UPDATE recordings SET transcription_json = ?, thumbnail_data = ? WHERE id = 0`, "[]", "")
	if err != nil {
		t.Errorf("expected columns to exist after migration: %v", err)
	}
}

// TestMigrate_OldSchemaWithColumns verifies that the migration system is
// idempotent when a legacy database already has all columns.
func TestMigrate_OldSchemaWithColumns(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	// Simulate a legacy database that already has the full schema.
	schema := `
		CREATE TABLE recordings (
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
		CREATE TABLE settings (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			active_provider TEXT NOT NULL DEFAULT 'openai',
			openai_config TEXT NOT NULL DEFAULT '{}',
			google_config TEXT NOT NULL DEFAULT '{}',
			local_config TEXT NOT NULL DEFAULT '{}',
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE auto_save (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id INTEGER NOT NULL UNIQUE,
			transcript_json TEXT NOT NULL DEFAULT '',
			operations_json TEXT NOT NULL DEFAULT '',
			playback_position INTEGER NOT NULL DEFAULT 0,
			saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("create legacy schema: %v", err)
	}

	if err := Migrate(db); err != nil {
		t.Fatalf("Migrate() error = %v", err)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if count != len(migrations) {
		t.Errorf("Expected %d applied migrations, got %d", len(migrations), count)
	}
}
