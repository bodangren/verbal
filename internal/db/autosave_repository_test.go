package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

func TestAutoSaveRepository_SaveAutoSave(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	autoSave := &AutoSave{
		ProjectID:        1,
		TranscriptJSON:   `{"words":[{"text":"hello","start":0,"end":0.5}]}`,
		OperationsJSON:   `[{"type":"delete","wordIndex":2}]`,
		PlaybackPosition: 15000,
	}

	err = repo.SaveAutoSave(autoSave)
	if err != nil {
		t.Fatalf("SaveAutoSave() error = %v", err)
	}

	if autoSave.ID == 0 {
		t.Error("Expected ID to be set after save")
	}
	if autoSave.SavedAt.IsZero() {
		t.Error("Expected SavedAt to be set")
	}
}

func TestAutoSaveRepository_SaveAutoSave_UpdatesExisting(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	autoSave := &AutoSave{
		ProjectID:        1,
		TranscriptJSON:   `{"words":[{"text":"hello","start":0,"end":0.5}]}`,
		OperationsJSON:   `[]`,
		PlaybackPosition: 0,
	}

	err = repo.SaveAutoSave(autoSave)
	if err != nil {
		t.Fatalf("SaveAutoSave() error = %v", err)
	}

	firstID := autoSave.ID

	autoSave.PlaybackPosition = 30000
	autoSave.TranscriptJSON = `{"words":[{"text":"updated","start":0,"end":1}]}`

	err = repo.SaveAutoSave(autoSave)
	if err != nil {
		t.Fatalf("SaveAutoSave() update error = %v", err)
	}

	if autoSave.ID != firstID {
		t.Errorf("Expected ID %d to remain unchanged after update, got %d", firstID, autoSave.ID)
	}

	saved, err := repo.LoadAutoSave(1)
	if err != nil {
		t.Fatalf("LoadAutoSave() error = %v", err)
	}

	if saved.PlaybackPosition != 30000 {
		t.Errorf("Expected PlaybackPosition 30000, got %d", saved.PlaybackPosition)
	}
	if saved.TranscriptJSON != `{"words":[{"text":"updated","start":0,"end":1}]}` {
		t.Errorf("Expected updated TranscriptJSON, got %s", saved.TranscriptJSON)
	}
}

func TestAutoSaveRepository_LoadAutoSave(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	autoSave := &AutoSave{
		ProjectID:        1,
		TranscriptJSON:   `{"words":[{"text":"hello","start":0,"end":0.5}]}`,
		OperationsJSON:   `[{"type":"delete","wordIndex":2}]`,
		PlaybackPosition: 15000,
	}

	err = repo.SaveAutoSave(autoSave)
	if err != nil {
		t.Fatalf("SaveAutoSave() error = %v", err)
	}

	loaded, err := repo.LoadAutoSave(1)
	if err != nil {
		t.Fatalf("LoadAutoSave() error = %v", err)
	}

	if loaded.ID != autoSave.ID {
		t.Errorf("Expected ID %d, got %d", autoSave.ID, loaded.ID)
	}
	if loaded.ProjectID != autoSave.ProjectID {
		t.Errorf("Expected ProjectID %d, got %d", autoSave.ProjectID, loaded.ProjectID)
	}
	if loaded.TranscriptJSON != autoSave.TranscriptJSON {
		t.Errorf("Expected TranscriptJSON %s, got %s", autoSave.TranscriptJSON, loaded.TranscriptJSON)
	}
	if loaded.OperationsJSON != autoSave.OperationsJSON {
		t.Errorf("Expected OperationsJSON %s, got %s", autoSave.OperationsJSON, loaded.OperationsJSON)
	}
	if loaded.PlaybackPosition != autoSave.PlaybackPosition {
		t.Errorf("Expected PlaybackPosition %d, got %d", autoSave.PlaybackPosition, loaded.PlaybackPosition)
	}
}

func TestAutoSaveRepository_LoadAutoSave_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	_, err = repo.LoadAutoSave(999)
	if err == nil {
		t.Error("Expected error for non-existent project")
	}
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("Expected sql.ErrNoRows, got %v", err)
	}
}

func TestAutoSaveRepository_HasAutoSave(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	has, err := repo.HasAutoSave(1)
	if err != nil {
		t.Fatalf("HasAutoSave() error = %v", err)
	}
	if has {
		t.Error("Expected HasAutoSave to be false for non-existent project")
	}

	autoSave := &AutoSave{
		ProjectID: 1,
	}
	err = repo.SaveAutoSave(autoSave)
	if err != nil {
		t.Fatalf("SaveAutoSave() error = %v", err)
	}

	has, err = repo.HasAutoSave(1)
	if err != nil {
		t.Fatalf("HasAutoSave() error = %v", err)
	}
	if !has {
		t.Error("Expected HasAutoSave to be true after save")
	}
}

func TestAutoSaveRepository_DeleteAutoSave(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	autoSave := &AutoSave{
		ProjectID: 1,
	}
	err = repo.SaveAutoSave(autoSave)
	if err != nil {
		t.Fatalf("SaveAutoSave() error = %v", err)
	}

	err = repo.DeleteAutoSave(1)
	if err != nil {
		t.Fatalf("DeleteAutoSave() error = %v", err)
	}

	has, err := repo.HasAutoSave(1)
	if err != nil {
		t.Fatalf("HasAutoSave() error = %v", err)
	}
	if has {
		t.Error("Expected HasAutoSave to be false after delete")
	}
}

func TestAutoSaveRepository_GetAutoSaveInfo(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	autoSave := &AutoSave{
		ProjectID:        1,
		TranscriptJSON:   `{"words":[{"text":"hello"}]}`,
		OperationsJSON:   `[]`,
		PlaybackPosition: 5000,
	}
	err = repo.SaveAutoSave(autoSave)
	if err != nil {
		t.Fatalf("SaveAutoSave() error = %v", err)
	}

	info, err := repo.GetAutoSaveInfo(1)
	if err != nil {
		t.Fatalf("GetAutoSaveInfo() error = %v", err)
	}

	if info == nil {
		t.Fatal("Expected non-nil AutoSaveInfo")
	}
	if info.ProjectID != 1 {
		t.Errorf("Expected ProjectID 1, got %d", info.ProjectID)
	}
	if info.HasData && (info.TranscriptWordCount != 1 || info.PlaybackPosition != 5000) {
		t.Errorf("Unexpected info data: TranscriptWordCount=%d, PlaybackPosition=%d",
			info.TranscriptWordCount, info.PlaybackPosition)
	}
}

func TestAutoSaveRepository_MultipleProjects(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	for projectID := int64(1); projectID <= 3; projectID++ {
		autoSave := &AutoSave{
			ProjectID: projectID,
		}
		err = repo.SaveAutoSave(autoSave)
		if err != nil {
			t.Fatalf("SaveAutoSave() for project %d error = %v", projectID, err)
		}
	}

	for projectID := int64(1); projectID <= 3; projectID++ {
		has, err := repo.HasAutoSave(projectID)
		if err != nil {
			t.Fatalf("HasAutoSave() for project %d error = %v", projectID, err)
		}
		if !has {
			t.Errorf("Expected HasAutoSave true for project %d", projectID)
		}
	}
}

func TestAutoSave_OperationsJSON_Parsing(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	repo := db.AutoSaveRepo()

	operations := []map[string]interface{}{
		{"type": "delete", "wordIndex": float64(5)},
		{"type": "reorder", "fromIndex": float64(3), "toIndex": float64(7)},
	}
	operationsJSON, err := json.Marshal(operations)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	autoSave := &AutoSave{
		ProjectID:      1,
		OperationsJSON: string(operationsJSON),
	}
	err = repo.SaveAutoSave(autoSave)
	if err != nil {
		t.Fatalf("SaveAutoSave() error = %v", err)
	}

	loaded, err := repo.LoadAutoSave(1)
	if err != nil {
		t.Fatalf("LoadAutoSave() error = %v", err)
	}

	var parsedOps []map[string]interface{}
	err = json.Unmarshal([]byte(loaded.OperationsJSON), &parsedOps)
	if err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if len(parsedOps) != 2 {
		t.Errorf("Expected 2 operations, got %d", len(parsedOps))
	}
}
