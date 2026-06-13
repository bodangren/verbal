package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNew(t *testing.T) {
	ctrl := New("/tmp/test.db", nil)
	if ctrl == nil {
		t.Fatal("New() returned nil")
	}
	if ctrl.IsInitialized() {
		t.Error("controller should not be initialized before Initialize()")
	}
	if ctrl.Database() != nil {
		t.Error("Database() should return nil before Initialize()")
	}
}

func TestNew_WithConfig(t *testing.T) {
	cfg := &Config{DBPath: "/custom/path.db"}
	ctrl := New("/tmp/test.db", cfg)
	if ctrl == nil {
		t.Fatal("New() returned nil")
	}
}

func TestController_Initialize(t *testing.T) {
	tmpDir := t.TempDir()
	ctrl := New(filepath.Join(tmpDir, "test.db"), nil)

	if err := ctrl.Initialize(); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if !ctrl.IsInitialized() {
		t.Error("controller should be initialized after Initialize()")
	}
	if ctrl.Database() == nil {
		t.Error("Database() should not be nil after Initialize()")
	}

	// Idempotent
	if err := ctrl.Initialize(); err != nil {
		t.Fatalf("Initialize() idempotent error = %v", err)
	}
}

func TestController_Initialize_InvalidPath(t *testing.T) {
	ctrl := New("/dev/null/impossible/test.db", nil)
	if err := ctrl.Initialize(); err == nil {
		t.Fatal("expected error for invalid database path")
	}
}

func TestController_Shutdown(t *testing.T) {
	tmpDir := t.TempDir()
	ctrl := New(filepath.Join(tmpDir, "test.db"), nil)

	if err := ctrl.Initialize(); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if err := ctrl.Shutdown(); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
	if ctrl.IsInitialized() {
		t.Error("controller should not be initialized after Shutdown()")
	}
}

func TestController_Shutdown_NotInitialized(t *testing.T) {
	ctrl := New("/tmp/test.db", nil)
	if err := ctrl.Shutdown(); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
}

func TestController_RunSmokeCheck(t *testing.T) {
	tmpDir := t.TempDir()
	ctrl := New(filepath.Join(tmpDir, "test.db"), nil)

	if err := ctrl.RunSmokeCheck(); err != nil {
		t.Fatalf("RunSmokeCheck() error = %v", err)
	}
	if ctrl.IsInitialized() {
		t.Error("controller should be shut down after RunSmokeCheck()")
	}
}

func TestController_Activate_InitializationError(t *testing.T) {
	ctrl := New("/dev/null/impossible/test.db", nil)

	// Activate should propagate the initialization error without reaching GTK.
	if err := ctrl.Activate(); err == nil {
		t.Fatal("expected error when activation fails to initialize")
	}
}

func TestDefaultDBPath(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	path := DefaultDBPath()
	if path == "" {
		t.Fatal("DefaultDBPath() returned empty path")
	}
	if filepath.Base(path) != "verbal.db" {
		t.Errorf("DefaultDBPath() = %q, want path ending in verbal.db", path)
	}
	if filepath.Base(filepath.Dir(path)) != "verbal" {
		t.Errorf("DefaultDBPath() = %q, want database under project directory", path)
	}
}

func TestController_Initialize_DefaultPathCreatesProjectLayout(t *testing.T) {
	dataHome := t.TempDir()
	t.Setenv("XDG_DATA_HOME", dataHome)
	ctrl := New("", nil)
	if err := ctrl.Initialize(); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	defer ctrl.Shutdown()

	projectDir := filepath.Join(dataHome, "verbal")
	if _, err := os.Stat(filepath.Join(projectDir, "recordings")); err != nil {
		t.Fatalf("recordings directory not created: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectDir, "verbal.db")); err != nil {
		t.Fatalf("verbal.db not created: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectDir, "recordings.db")); err == nil {
		t.Fatalf("legacy recordings.db should not be created")
	} else if !os.IsNotExist(err) {
		t.Fatalf("stat legacy recordings.db: %v", err)
	}
}
