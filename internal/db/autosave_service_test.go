package db

import (
	"path/filepath"
	"testing"
	"time"
)

func TestAutoSaveService_StartStop(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	svc := NewAutoSaveService(db, 1*time.Second, nil)

	if svc.IsDirty() {
		t.Error("Expected not dirty at start")
	}

	svc.Start()
	time.Sleep(100 * time.Millisecond)

	if !svc.running {
		t.Error("Expected running after Start")
	}

	svc.Stop()

	if svc.running {
		t.Error("Expected not running after Stop")
	}
}

func TestAutoSaveService_MarkDirty(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	svc := NewAutoSaveService(db, 1*time.Second, nil)

	if svc.IsDirty() {
		t.Error("Expected not dirty at start")
	}

	svc.MarkDirty()

	if !svc.IsDirty() {
		t.Error("Expected dirty after MarkDirty")
	}
}

func TestAutoSaveService_SetProject(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	svc := NewAutoSaveService(db, 1*time.Second, nil)

	svc.SetProject(1, `{"words":[]}`, `[]`, 5000)

	if !svc.IsDirty() {
		t.Error("Expected dirty after SetProject")
	}

	projectID, data := svc.GetProject()
	if projectID != 1 {
		t.Errorf("Expected projectID 1, got %d", projectID)
	}
	if data == nil {
		t.Fatal("Expected data to be non-nil")
	}
	if data.TranscriptJSON != `{"words":[]}` {
		t.Errorf("Expected transcript %s, got %s", `{"words":[]}`, data.TranscriptJSON)
	}
	if data.PlaybackPosition != 5000 {
		t.Errorf("Expected position 5000, got %d", data.PlaybackPosition)
	}
}

func TestAutoSaveService_SetInterval(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	svc := NewAutoSaveService(db, 1*time.Second, nil)

	if svc.GetInterval() != 1*time.Second {
		t.Errorf("Expected 1s interval, got %v", svc.GetInterval())
	}

	svc.SetInterval(30 * time.Second)

	if svc.GetInterval() != 30*time.Second {
		t.Errorf("Expected 30s interval, got %v", svc.GetInterval())
	}
}

func TestAutoSaveService_AutoSaveOnInterval(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	svc := NewAutoSaveService(db, 50*time.Millisecond, nil)
	svc.Start()
	defer svc.Stop()

	svc.SetProject(1, `{"words":[{"text":"test"}]}`, `[]`, 1000)

	time.Sleep(150 * time.Millisecond)

	if svc.IsDirty() {
		t.Error("Expected not dirty after auto-save interval")
	}

	has, err := db.AutoSaveRepo().HasAutoSave(1)
	if err != nil {
		t.Fatalf("HasAutoSave() error = %v", err)
	}
	if !has {
		t.Error("Expected auto-save to exist for project 1")
	}

	autoSave, err := db.AutoSaveRepo().LoadAutoSave(1)
	if err != nil {
		t.Fatalf("LoadAutoSave() error = %v", err)
	}
	if autoSave.TranscriptJSON != `{"words":[{"text":"test"}]}` {
		t.Errorf("Expected transcript JSON to be saved, got %s", autoSave.TranscriptJSON)
	}
}

func TestAutoSaveService_MultipleProjects(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := NewDatabase(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase() error = %v", err)
	}
	defer db.Close()

	svc := NewAutoSaveService(db, 50*time.Millisecond, nil)
	svc.Start()
	defer svc.Stop()

	svc.SetProject(1, `{"words":[]}`, `[]`, 1000)
	time.Sleep(100 * time.Millisecond)

	svc.SetProject(2, `{"words":[]}`, `[]`, 2000)
	time.Sleep(100 * time.Millisecond)

	autoSave1, err := db.AutoSaveRepo().LoadAutoSave(1)
	if err != nil {
		t.Fatalf("LoadAutoSave(1) error = %v", err)
	}
	if autoSave1.PlaybackPosition != 1000 {
		t.Errorf("Expected position 1000 for project 1, got %d", autoSave1.PlaybackPosition)
	}

	autoSave2, err := db.AutoSaveRepo().LoadAutoSave(2)
	if err != nil {
		t.Fatalf("LoadAutoSave(2) error = %v", err)
	}
	if autoSave2.PlaybackPosition != 2000 {
		t.Errorf("Expected position 2000 for project 2, got %d", autoSave2.PlaybackPosition)
	}
}
