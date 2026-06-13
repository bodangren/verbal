package settings

import (
	"os"
	"path/filepath"
)

// Paths resolves the project directory layout per spec FR4:
// projectDir/recordings/ for media files, projectDir/verbal.db for the database.
type Paths struct {
	ProjectDir    string
	RecordingsDir string
	DatabasePath  string
}

// NewPaths creates a Paths instance deriving the recordings subdirectory
// and database path from the given project directory root.
func NewPaths(projectDir string) *Paths {
	return &Paths{
		ProjectDir:    projectDir,
		RecordingsDir: filepath.Join(projectDir, "recordings"),
		DatabasePath:  filepath.Join(projectDir, "verbal.db"),
	}
}

// DefaultProjectDir returns the default project directory path.
// It uses the XDG data home convention, falling back to ~/.config/verbal.
func DefaultProjectDir() string {
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		return filepath.Join(xdg, "verbal")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".config", "verbal")
	}
	return filepath.Join(home, ".config", "verbal")
}

// Initialize creates the project directory and recordings subdirectory
// with mode 0755. It is idempotent — calling Initialize() twice does
// not error and does not clobber an existing verbal.db file.
func (p *Paths) Initialize() error {
	if err := os.MkdirAll(p.ProjectDir, 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(p.RecordingsDir, 0755); err != nil {
		return err
	}
	return nil
}
