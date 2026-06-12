package db

import (
	"database/sql"
	"fmt"
	"sort"
)

// Migration represents a single ordered schema change. Exactly one of SQL or
// Func should be set. If Func is set, it is executed inside a transaction and
// is responsible for making the schema change idempotent.
type Migration struct {
	Version int
	Name    string
	SQL     string
	Func    func(*sql.Tx) error
}

// migrations is the ordered list of schema changes for the Verbal database.
// New migrations are appended at the end; existing version numbers must never
// be reused or modified.
var migrations = []Migration{
	{
		Version: 1,
		Name:    "create recordings table",
		SQL: `
CREATE TABLE IF NOT EXISTS recordings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	title TEXT NOT NULL DEFAULT '',
	file_path TEXT NOT NULL,
	duration INTEGER NOT NULL DEFAULT 0,
	transcription_status TEXT NOT NULL DEFAULT 'pending',
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`,
	},
	{
		Version: 2,
		Name:    "create transcripts table",
		SQL: `
CREATE TABLE IF NOT EXISTS transcripts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	recording_id INTEGER NOT NULL UNIQUE,
	language TEXT NOT NULL DEFAULT '',
	words_json TEXT NOT NULL DEFAULT '',
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);
`,
	},
	{
		Version: 3,
		Name:    "add recording transcription and thumbnail columns",
		Func: func(tx *sql.Tx) error {
			if err := addColumnIfNotExists(tx, "recordings", "transcription_json", "TEXT NOT NULL DEFAULT ''"); err != nil {
				return err
			}
			if err := addColumnIfNotExists(tx, "recordings", "thumbnail_data", "TEXT NOT NULL DEFAULT ''"); err != nil {
				return err
			}
			if err := addColumnIfNotExists(tx, "recordings", "thumbnail_mime_type", "TEXT NOT NULL DEFAULT ''"); err != nil {
				return err
			}
			if err := addColumnIfNotExists(tx, "recordings", "thumbnail_generated_at", "DATETIME NULL"); err != nil {
				return err
			}
			return nil
		},
	},
	{
		Version: 4,
		Name:    "create settings table",
		SQL: `
CREATE TABLE IF NOT EXISTS settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	active_provider TEXT NOT NULL DEFAULT 'openai',
	openai_config TEXT NOT NULL DEFAULT '{}',
	google_config TEXT NOT NULL DEFAULT '{}',
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`,
	},
	{
		Version: 5,
		Name:    "create auto_save table",
		SQL: `
CREATE TABLE IF NOT EXISTS auto_save (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id INTEGER NOT NULL UNIQUE,
	transcript_json TEXT NOT NULL DEFAULT '',
	operations_json TEXT NOT NULL DEFAULT '',
	playback_position INTEGER NOT NULL DEFAULT 0,
	saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`,
	},
	{
		Version: 6,
		Name:    "add local provider settings column",
		Func: func(tx *sql.Tx) error {
			return addColumnIfNotExists(tx, "settings", "local_config", "TEXT NOT NULL DEFAULT '{}'")
		},
	},
}

// Migrate applies all pending migrations in version order. It creates the
// schema_migrations tracking table if it does not exist and records each
// applied migration in a transaction. Calling Migrate on an already-migrated
// database is a no-op.
func Migrate(db *sql.DB) error {
	if db == nil {
		return fmt.Errorf("migrate: database is nil")
	}

	if err := createSchemaMigrationsTable(db); err != nil {
		return fmt.Errorf("migrate: create schema_migrations: %w", err)
	}

	applied, err := appliedVersions(db)
	if err != nil {
		return fmt.Errorf("migrate: load applied versions: %w", err)
	}

	for _, m := range migrations {
		if applied[m.Version] {
			continue
		}
		if err := applyMigration(db, m); err != nil {
			return fmt.Errorf("migrate: apply version %d (%s): %w", m.Version, m.Name, err)
		}
	}

	return nil
}

// createSchemaMigrationsTable ensures the migration tracking table exists.
func createSchemaMigrationsTable(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}

// appliedVersions returns a set of migration versions already recorded in the
// schema_migrations table.
func appliedVersions(db *sql.DB) (map[int]bool, error) {
	rows, err := db.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := make(map[int]bool)
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		versions[v] = true
	}
	return versions, rows.Err()
}

// applyMigration runs a single migration inside a transaction and records it.
func applyMigration(db *sql.DB, m Migration) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	switch {
	case m.Func != nil:
		if err := m.Func(tx); err != nil {
			return err
		}
	case m.SQL != "":
		if _, err := tx.Exec(m.SQL); err != nil {
			return fmt.Errorf("execute migration: %w", err)
		}
	default:
		return fmt.Errorf("migration %d has no SQL or Func", m.Version)
	}

	if _, err := tx.Exec(
		`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`,
		m.Version, m.Name,
	); err != nil {
		return fmt.Errorf("record migration: %w", err)
	}

	return tx.Commit()
}

// addColumnIfNotExists adds a column to a table if it is not already present.
func addColumnIfNotExists(tx *sql.Tx, table, column, columnDef string) error {
	exists, err := columnExists(tx, table, column)
	if err != nil {
		return fmt.Errorf("check column %s.%s: %w", table, column, err)
	}
	if exists {
		return nil
	}

	_, err = tx.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, columnDef))
	if err != nil {
		return fmt.Errorf("add column %s.%s: %w", table, column, err)
	}
	return nil
}

// columnExists reports whether a column exists in the given table.
func columnExists(tx *sql.Tx, table, column string) (bool, error) {
	rows, err := tx.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name string
		var typ string
		var notNull int
		var dfltValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notNull, &dfltValue, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

// MigrationVersions returns the sorted list of defined migration versions.
// It is primarily useful for tests and diagnostics.
func MigrationVersions() []int {
	versions := make([]int, len(migrations))
	for i, m := range migrations {
		versions[i] = m.Version
	}
	sort.Ints(versions)
	return versions
}
