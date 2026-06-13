// Package app provides the application controller: the single owner of
// dependency construction and lifecycle for the Verbal GTK application.
package app

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"verbal/internal/ai"
	"verbal/internal/db"
	"verbal/internal/media"
	"verbal/internal/settings"
	"verbal/internal/thumbnail"
)

// Config provides optional configuration for the application controller.
type Config struct {
	// DBPath overrides the default database path.
	DBPath string
}

// Exporter copies a media file from src to dest with progress reporting.
type Exporter interface {
	Export(ctx context.Context, srcPath, destPath string, progress func(float64, string)) error
}

// RecordingDeleter removes a recording by ID.
type RecordingDeleter interface {
	Delete(id int64) error
}

type originalFileExporterAdapter struct {
	inner *media.Exporter
}

func (a *originalFileExporterAdapter) Export(ctx context.Context, srcPath, destPath string, progress func(float64, string)) error {
	return a.inner.Export(ctx, srcPath, destPath, progress)
}

// Controller owns dependency construction and lifecycle for the Verbal app.
type Controller struct {
	config           Config
	dbPath           string
	database         *db.Database
	recordingSvc     *db.RecordingService
	exporter         Exporter
	recordingDeleter RecordingDeleter
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

// WithExporter sets the exporter dependency and returns the controller for chaining.
func (c *Controller) WithExporter(e Exporter) *Controller {
	c.exporter = e
	return c
}

// WithRecordingDeleter sets the recording deleter dependency and returns the
// controller for chaining.
func (c *Controller) WithRecordingDeleter(d RecordingDeleter) *Controller {
	c.recordingDeleter = d
	return c
}

// DefaultDBPath returns the default SQLite database path for the current user.
func DefaultDBPath() string {
	projectDir := settings.DefaultProjectDir()
	if projectDir == "" {
		return ""
	}
	return settings.NewPaths(projectDir).DatabasePath
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
		paths := settings.NewPaths(settings.DefaultProjectDir())
		if paths.ProjectDir == "" {
			return fmt.Errorf("controller: no database path available")
		}
		if err := paths.Initialize(); err != nil {
			return fmt.Errorf("controller: initialize project paths: %w", err)
		}
		dbPath = paths.DatabasePath
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
	c.recordingSvc = db.NewRecordingService(database)
	if c.exporter == nil {
		c.exporter = &originalFileExporterAdapter{inner: media.NewExporter()}
	}
	if c.recordingDeleter == nil {
		c.recordingDeleter = c.recordingSvc
	}
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

// ExportRecording copies the original media file for the given recording to
// destPath, reporting progress via the callback. It returns an error if the
// recording is unknown or the exporter fails.
func (c *Controller) ExportRecording(ctx context.Context, recID int64, destPath string, progress func(float64, string)) error {
	if c.recordingSvc == nil {
		return fmt.Errorf("export: controller not initialized")
	}
	rec, err := c.recordingSvc.GetByID(recID)
	if err != nil {
		return fmt.Errorf("export: lookup recording %d: %w", recID, err)
	}
	if c.exporter == nil {
		return fmt.Errorf("export: no exporter configured")
	}
	if err := c.exporter.Export(ctx, rec.FilePath, destPath, progress); err != nil {
		return fmt.Errorf("export: %w", err)
	}
	return nil
}

// DeleteRecording removes a recording from the database. When removeMediaFile
// is true it also deletes the underlying media file from disk.
func (c *Controller) DeleteRecording(recID int64, removeMediaFile bool) error {
	if c.recordingSvc == nil {
		return fmt.Errorf("delete: controller not initialized")
	}
	var filePath string
	if removeMediaFile {
		rec, err := c.recordingSvc.GetByID(recID)
		if err != nil {
			return fmt.Errorf("delete: lookup recording %d: %w", recID, err)
		}
		filePath = rec.FilePath
	}

	if c.recordingDeleter != nil {
		if err := c.recordingDeleter.Delete(recID); err != nil {
			return fmt.Errorf("delete: %w", err)
		}
	} else {
		if err := c.recordingSvc.Delete(recID); err != nil {
			return fmt.Errorf("delete: %w", err)
		}
	}

	if removeMediaFile && filePath != "" {
		if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("delete media file: %w", err)
		}
	}
	return nil
}
