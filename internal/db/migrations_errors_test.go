package db

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestMigrate_FuncMigrationError(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	original := migrations
	migrations = []Migration{
		{
			Version: 1,
			Name:    "always fails",
			Func: func(*sql.Tx) error {
				return errors.New("migration failed")
			},
		},
	}
	defer func() { migrations = original }()

	if err := Migrate(db); err == nil {
		t.Fatal("expected Migrate to return error")
	}

	// schema_migrations table should exist but no version should be recorded.
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 applied migrations after failed migration, got %d", count)
	}
}

func TestMigrate_SQLMigrationError(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	original := migrations
	migrations = []Migration{
		{
			Version: 1,
			Name:    "invalid sql",
			SQL:     "THIS IS NOT VALID SQL",
		},
	}
	defer func() { migrations = original }()

	if err := Migrate(db); err == nil {
		t.Fatal("expected Migrate to return error")
	}
}

func TestApplyMigration_NoBody(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := createSchemaMigrationsTable(db); err != nil {
		t.Fatalf("create schema_migrations: %v", err)
	}

	m := Migration{Version: 1, Name: "empty"}
	if err := applyMigration(db, m); err == nil {
		t.Fatal("expected error for migration with no SQL or Func")
	}
}
