// Package app provides the application controller: the single owner of
// dependency construction and lifecycle for the Verbal GTK application.
package app

import (
	"fmt"
	"os"
	"path/filepath"

	"verbal/internal/ai"
	"verbal/internal/db"
	"verbal/internal/settings"
	"verbal/internal/thumbnail"
)

// Config provides optional configuration for the application controller.
type Config struct {
	// DBPath overrides the default database path.
	DBPath string
}

// Controller owns dependency construction and lifecycle for the Verbal app.
type Controller struct {
	config   Config
	dbPath   string
	database *db.Database
}

// New creates a Controller. If cfg is nil, default configuration is used.
func New(dbPath string, cfg *Config) *Controller {
	if cfg == nil {
		cfg = &Config{}
	}
	return &Controller{
		config: *cfg,
		dbPath: dbPath,
	}
}

// DefaultDBPath returns the default SQLite database path for the current user.
func DefaultDBPath() string {
	homeDir, _ := os.UserHomeDir()
	if homeDir == "" {
		return ""
	}
	return filepath.Join(homeDir, ".config", "verbal", "recordings.db")
}

// Initialize opens the SQLite database and runs migrations.
func (c *Controller) Initialize() error {
	if c.database != nil {
		return nil
	}

	dbPath := c.config.DBPath
	if dbPath == "" {
		dbPath = c.dbPath
	}
	if dbPath == "" {
		dbPath = DefaultDBPath()
	}
	if dbPath == "" {
		return fmt.Errorf("controller: no database path available")
	}

	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("controller: create database directory: %w", err)
	}

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		return fmt.Errorf("controller: open database: %w", err)
	}

	c.database = database
	return nil
}

// Activate starts the GTK application. It requires a display.
func (c *Controller) Activate() error {
	if err := c.Initialize(); err != nil {
		return err
	}
	return runGTKApp(c)
}

// Shutdown releases resources owned by the controller.
func (c *Controller) Shutdown() error {
	if c.database != nil {
		if err := c.database.Close(); err != nil {
			return fmt.Errorf("controller: close database: %w", err)
		}
		c.database = nil
	}
	return nil
}

// RunSmokeCheck initializes the controller and exercises core services without
// opening a GTK window. It calls Shutdown before returning.
func (c *Controller) RunSmokeCheck() error {
	if err := c.Initialize(); err != nil {
		return err
	}
	defer c.Shutdown()

	recordingSvc := db.NewRecordingService(c.database)
	if _, err := recordingSvc.GetLibrary(); err != nil {
		return fmt.Errorf("smoke check: recording service query: %w", err)
	}

	thumbnailSvc := thumbnail.NewService(
		c.database.ThumbnailRepo(),
		thumbnail.NewGenerator(thumbnail.DefaultGeneratorConfig()),
		thumbnail.DefaultServiceConfig(),
	)
	thumbnailSvc.Close()

	aiFactory := ai.NewFactory()
	settingsSvc := settings.NewService(c.database.SettingsRepo(), aiFactory)
	if _, err := settingsSvc.LoadSettingsOrDefault(); err != nil {
		return fmt.Errorf("smoke check: settings load: %w", err)
	}

	return nil
}

// Database returns the managed database connection. It returns nil if
// Initialize has not been called or failed.
func (c *Controller) Database() *db.Database {
	return c.database
}

// IsInitialized reports whether the controller has opened a database.
func (c *Controller) IsInitialized() bool {
	return c.database != nil
}
