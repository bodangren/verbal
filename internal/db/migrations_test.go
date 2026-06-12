package db

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestMigrate_CreatesSchemaMigrationsTable(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

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

func TestMigrate_IsIdempotent(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	for i := 0; i < 3; i++ {
		if err := Migrate(db); err != nil {
			t.Fatalf("Migrate() iteration %d error = %v", i, err)
		}
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if count != len(migrations) {
		t.Errorf("Expected %d applied migrations after repeated calls, got %d", len(migrations), count)
	}
}

func TestMigrate_AppliesInOrder(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := Migrate(db); err != nil {
		t.Fatalf("Migrate() error = %v", err)
	}

	versions := MigrationVersions()
	for i, v := range versions {
		var exists int
		err := db.QueryRow(`SELECT 1 FROM schema_migrations WHERE version = ?`, v).Scan(&exists)
		if err != nil {
			t.Fatalf("migration version %d not recorded: %v", v, err)
		}
		if i > 0 && v <= versions[i-1] {
			t.Errorf("migration versions not strictly increasing: %d after %d", v, versions[i-1])
		}
	}
}

func TestMigrate_CreatesRecordingsTable(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := Migrate(db); err != nil {
		t.Fatalf("Migrate() error = %v", err)
	}

	_, err = db.Exec(`INSERT INTO recordings (title, file_path, duration) VALUES (?, ?, ?)`, "Test", "/tmp/test.mp4", 1000)
	if err != nil {
		t.Fatalf("insert recording: %v", err)
	}
}

func TestMigrate_CreatesTranscriptsTable(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := Migrate(db); err != nil {
		t.Fatalf("Migrate() error = %v", err)
	}

	res, err := db.Exec(`INSERT INTO recordings (title, file_path, duration) VALUES (?, ?, ?)`, "Test", "/tmp/test.mp4", 1000)
	if err != nil {
		t.Fatalf("insert recording: %v", err)
	}
	recordingID, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("last insert id: %v", err)
	}

	_, err = db.Exec(`INSERT INTO transcripts (recording_id, language, words_json) VALUES (?, ?, ?)`, recordingID, "en", "[]")
	if err != nil {
		t.Fatalf("insert transcript: %v", err)
	}
}

func TestMigrate_NilDB(t *testing.T) {
	if err := Migrate(nil); err == nil {
		t.Fatal("expected error for nil database")
	}
}

func TestMigrationVersions(t *testing.T) {
	versions := MigrationVersions()
	if len(versions) != len(migrations) {
		t.Errorf("Expected %d versions, got %d", len(migrations), len(versions))
	}
	for i := 1; i < len(versions); i++ {
		if versions[i] <= versions[i-1] {
			t.Errorf("versions not sorted: %v", versions)
		}
	}
}
