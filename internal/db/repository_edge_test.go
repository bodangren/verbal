package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRecording_IsAvailable(t *testing.T) {
	tmpDir := t.TempDir()
	existingFile := filepath.Join(tmpDir, "existing.mp4")
	if err := os.WriteFile(existingFile, []byte("data"), 0644); err != nil {
		t.Fatalf("create test file: %v", err)
	}

	rec := &Recording{FilePath: existingFile}
	if !rec.IsAvailable() {
		t.Errorf("expected IsAvailable=true for existing file")
	}

	rec.FilePath = filepath.Join(tmpDir, "missing.mp4")
	if rec.IsAvailable() {
		t.Errorf("expected IsAvailable=false for missing file")
	}

	var nilRec *Recording
	if nilRec.IsAvailable() {
		t.Errorf("expected IsAvailable=false for nil recording")
	}
}

func TestDatabase_GetDBPathAndGetDB(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	if got := db.GetDBPath(); got != dbPath {
		t.Errorf("GetDBPath() = %q, want %q", got, dbPath)
	}
	if db.GetDB() == nil {
		t.Error("GetDB() returned nil")
	}
}

func TestDatabase_NewDatabase_MkdirError(t *testing.T) {
	// Use a path that cannot be created as a directory.
	dbPath := "/dev/null/impossible/test.db"
	_, err := NewDatabase(dbPath)
	if err == nil {
		t.Fatal("expected error for uncreateable directory")
	}
}
