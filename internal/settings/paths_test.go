package settings

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// TestPaths_NewPaths_SetsFields verifies the Paths constructor derives
// the recordings/ subdirectory and verbal.db path from the project
// directory root per spec FR4 ("Media files live under
// projectDir/recordings/. Database lives at projectDir/verbal.db.").
func TestPaths_NewPaths_SetsFields(t *testing.T) {
	projectDir := filepath.Join(t.TempDir(), "myproject")
	p := NewPaths(projectDir)
	if p == nil {
		t.Fatal("NewPaths returned nil")
	}
	if p.ProjectDir != projectDir {
		t.Errorf("ProjectDir = %q, want %q", p.ProjectDir, projectDir)
	}
	wantRecordings := filepath.Join(projectDir, "recordings")
	if p.RecordingsDir != wantRecordings {
		t.Errorf("RecordingsDir = %q, want %q", p.RecordingsDir, wantRecordings)
	}
	wantDB := filepath.Join(projectDir, "verbal.db")
	if p.DatabasePath != wantDB {
		t.Errorf("DatabasePath = %q, want %q", p.DatabasePath, wantDB)
	}
}

// TestPaths_Initialize_CreatesProjectDir verifies Initialize creates
// the project directory when it does not exist (spec FR4 "Project
// directory structure is created on first run.").
func TestPaths_Initialize_CreatesProjectDir(t *testing.T) {
	projectDir := filepath.Join(t.TempDir(), "freshproject")
	if _, err := os.Stat(projectDir); !os.IsNotExist(err) {
		t.Fatalf("precondition: projectDir should not exist yet, stat err = %v", err)
	}

	p := NewPaths(projectDir)
	if err := p.Initialize(); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}

	info, err := os.Stat(projectDir)
	if err != nil {
		t.Fatalf("ProjectDir not created: stat error = %v", err)
	}
	if !info.IsDir() {
		t.Errorf("ProjectDir exists but is not a directory")
	}
}

// TestPaths_Initialize_CreatesRecordingsSubdir verifies Initialize
// creates the recordings/ subdirectory under projectDir (spec FR4
// "Media files live under projectDir/recordings/.").
func TestPaths_Initialize_CreatesRecordingsSubdir(t *testing.T) {
	projectDir := filepath.Join(t.TempDir(), "freshproject")
	p := NewPaths(projectDir)
	if err := p.Initialize(); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}

	info, err := os.Stat(p.RecordingsDir)
	if err != nil {
		t.Fatalf("RecordingsDir not created: stat error = %v", err)
	}
	if !info.IsDir() {
		t.Errorf("RecordingsDir exists but is not a directory")
	}
}

// TestPaths_Initialize_PermissionsAre0755 verifies both created
// directories have mode 0755 per test-strategy §5 P5 ("directory
// created with 0755, recordings/ subdir"). Skipped on non-unix
// platforms where Unix mode bits are not meaningful.
func TestPaths_Initialize_PermissionsAre0755(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix mode bits not enforced on Windows")
	}

	projectDir := filepath.Join(t.TempDir(), "freshproject")
	p := NewPaths(projectDir)
	if err := p.Initialize(); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}

	cases := []struct {
		name string
		path string
	}{
		{"ProjectDir", p.ProjectDir},
		{"RecordingsDir", p.RecordingsDir},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			info, err := os.Stat(c.path)
			if err != nil {
				t.Fatalf("stat %s: %v", c.name, err)
			}
			mode := info.Mode().Perm()
			if mode != 0755 {
				t.Errorf("%s mode = %o, want 0755", c.name, mode)
			}
		})
	}
}

// TestPaths_Initialize_IsIdempotent verifies that a second call to
// Initialize after a successful first call returns nil (test-strategy
// §3 "first-run idempotency — running Initialize() twice must not
// error"). Also asserts the directories still exist after the second
// call so a STUB that no-ops both calls cannot pass.
func TestPaths_Initialize_IsIdempotent(t *testing.T) {
	projectDir := filepath.Join(t.TempDir(), "freshproject")
	p := NewPaths(projectDir)
	if err := p.Initialize(); err != nil {
		t.Fatalf("first Initialize() error = %v", err)
	}
	if err := p.Initialize(); err != nil {
		t.Fatalf("second Initialize() error = %v", err)
	}

	for _, dir := range []string{p.ProjectDir, p.RecordingsDir} {
		info, err := os.Stat(dir)
		if err != nil {
			t.Fatalf("after second Initialize: %s not present: %v", dir, err)
		}
		if !info.IsDir() {
			t.Errorf("after second Initialize: %s exists but is not a directory", dir)
		}
	}
}

// TestPaths_Initialize_DoesNotClobberDatabase verifies the second
// Initialize call does not overwrite an existing verbal.db file
// (test-strategy §3 "must not clobber verbal.db"). This protects
// against an implementation that naively re-creates the database
// every time Initialize is called.
func TestPaths_Initialize_DoesNotClobberDatabase(t *testing.T) {
	projectDir := filepath.Join(t.TempDir(), "existingproject")
	p := NewPaths(projectDir)
	if err := p.Initialize(); err != nil {
		t.Fatalf("first Initialize() error = %v", err)
	}

	sentinel := []byte("existing-verbal-db-bytes-do-not-clobber")
	if err := os.WriteFile(p.DatabasePath, sentinel, 0644); err != nil {
		t.Fatalf("write sentinel database: %v", err)
	}

	if err := p.Initialize(); err != nil {
		t.Fatalf("second Initialize() error = %v", err)
	}

	got, err := os.ReadFile(p.DatabasePath)
	if err != nil {
		t.Fatalf("read sentinel after second Initialize: %v", err)
	}
	if !bytes.Equal(got, sentinel) {
		t.Errorf("Initialize clobbered existing database: got %q, want %q", got, sentinel)
	}
}

// TestPaths_DefaultProjectDir_NonEmpty verifies DefaultProjectDir
// returns a non-empty absolute path that callers can hand to
// NewPaths(). The exact location is an implementation detail of the
// Green phase; this test pins only the non-empty contract so the UI
// layer (Phase 4 controller wiring) has a deterministic default to
// fall back to when no override is supplied.
func TestPaths_DefaultProjectDir_NonEmpty(t *testing.T) {
	got := DefaultProjectDir()
	if got == "" {
		t.Fatal("DefaultProjectDir() returned empty string; UI layer requires a non-empty default")
	}
	if !filepath.IsAbs(got) {
		t.Errorf("DefaultProjectDir() = %q, want absolute path", got)
	}
}


