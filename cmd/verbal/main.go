package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"verbal/internal/ai"
	"verbal/internal/db"
	"verbal/internal/lifecycle"
	"verbal/internal/media"
	"verbal/internal/settings"
	"verbal/internal/sync"
	"verbal/internal/thumbnail"
	"verbal/internal/transcription"
	"verbal/internal/ui"

	"github.com/OmegaRogue/gotk4-gstreamer/pkg/gst"
	"github.com/diamondburned/gotk4/pkg/gdk/v4"
	"github.com/diamondburned/gotk4/pkg/gio/v2"
	"github.com/diamondburned/gotk4/pkg/glib/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

type appState struct {
	window          *gtk.ApplicationWindow
	stack           *gtk.Stack
	playbackWindow  *ui.PlaybackWindow
	libraryView     *ui.LibraryView
	playback        *media.PlaybackPipeline
	monitor         *media.PositionMonitor
	syncIntegration *sync.Integration
	wordContainer   *ui.WordContainer
	editableView    *ui.EditableTranscriptionView
	loader          *ui.RecordingLoader
	currentPath     string
	db              *db.Database
	recordingSvc    *db.RecordingService
	thumbnailSvc    *thumbnail.Service
	settingsSvc     *settings.Service
	aiFactory       *ai.Factory

	// Backup system
	backupManager   *lifecycle.BackupManager
	backupScheduler *lifecycle.BackupScheduler

	// Dialogs
	exportDialog *ui.ExportDialog
	importDialog *ui.ImportDialog
	repairDialog *ui.RepairDialog
}

const smokeCheckArg = "--smoke-check"

func main() {
	homeDir, _ := os.UserHomeDir()
	loadEnvFiles(homeDir)

	if len(os.Args) > 1 && os.Args[1] == smokeCheckArg {
		if err := runStartupSmoke(homeDir); err != nil {
			fmt.Fprintf(os.Stderr, "startup smoke check failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("smoke-check:ok")
		return
	}

	// Initialize database
	database, err := initializeDatabase(homeDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to initialize database: %v\n", err)
		database = nil
	}

	// Ensure database is closed on exit
	if database != nil {
		defer database.Close()
	}

	app := gtk.NewApplication("com.verbal.editor", gio.ApplicationFlagsNone)
	app.ConnectActivate(func() {
		activate(app, database)
	})

	if code := app.Run(os.Args); code > 0 {
		os.Exit(code)
	}
}

func loadEnvFiles(homeDir string) {
	if homeDir != "" {
		envPath := filepath.Join(homeDir, ".config", "verbal", ".env")
		_ = ai.LoadEnvFromFile(envPath)
	}

	execDir, _ := filepath.Abs(filepath.Dir(os.Args[0]))
	if execDir != "" {
		_ = ai.LoadEnvFromFile(filepath.Join(execDir, ".env"))
	}
	_ = ai.LoadEnvFromFile(".env")
}

func initializeDatabase(homeDir string) (*db.Database, error) {
	if homeDir == "" {
		return nil, nil
	}

	dbPath := filepath.Join(homeDir, ".config", "verbal", "recordings.db")
	return db.NewDatabase(dbPath)
}

// runStartupSmoke validates startup-critical wiring without opening GTK windows.
func runStartupSmoke(homeDir string) error {
	database, err := initializeDatabase(homeDir)
	if err != nil {
		return fmt.Errorf("initialize database: %w", err)
	}
	if database == nil {
		return nil
	}
	defer database.Close()

	recordingSvc := db.NewRecordingService(database)
	if _, err := recordingSvc.GetLibrary(); err != nil {
		return fmt.Errorf("recording service query: %w", err)
	}

	thumbnailSvc := thumbnail.NewService(
		database.ThumbnailRepo(),
		thumbnail.NewGenerator(thumbnail.DefaultGeneratorConfig()),
		thumbnail.DefaultServiceConfig(),
	)
	thumbnailSvc.Close()

	aiFactory := ai.NewFactory()
	settingsSvc := settings.NewService(database.SettingsRepo(), aiFactory)
	if _, err := settingsSvc.LoadSettingsOrDefault(); err != nil {
		return fmt.Errorf("settings load: %w", err)
	}

	return nil
}

func activate(app *gtk.Application, database *db.Database) {
	ui.LoadApplicationCSS()

	window := gtk.NewApplicationWindow(app)
	window.SetTitle("Verbal - Video Transcription Editor")
	configureMainWindowDefaults(&window.Window)

	var recordingSvc *db.RecordingService
	var thumbnailSvc *thumbnail.Service
	var settingsSvc *settings.Service
	var aiFactory *ai.Factory
	if database != nil {
		recordingSvc = db.NewRecordingService(database)
		thumbnailSvc = thumbnail.NewService(
			database.ThumbnailRepo(),
			thumbnail.NewGenerator(thumbnail.DefaultGeneratorConfig()),
			thumbnail.DefaultServiceConfig(),
		)
		aiFactory = ai.NewFactory()
		settingsRepo := database.SettingsRepo()
		settingsSvc = settings.NewService(settingsRepo, aiFactory)
	}

	// Create the stack for view switching
	stack := gtk.NewStack()
	stack.SetTransitionType(gtk.StackTransitionTypeSlideLeftRight)
	stack.SetTransitionDuration(200)

	state := &appState{
		window:       window,
		stack:        stack,
		loader:       ui.NewRecordingLoader(),
		db:           database,
		recordingSvc: recordingSvc,
		thumbnailSvc: thumbnailSvc,
		settingsSvc:  settingsSvc,
		aiFactory:    aiFactory,
	}

	// Initialize backup system if database is available
	if database != nil {
		dbPath := database.GetDBPath()
		// Get home directory for default backup location
		backupHomeDir, _ := os.UserHomeDir()
		backupDir := filepath.Join(backupHomeDir, ".config", "verbal", "backups")
		// Use NewBackupManagerWithDB for atomic backup operations with BEGIN IMMEDIATE
		state.backupManager = lifecycle.NewBackupManagerWithDB(dbPath, backupDir, database.GetDB(), nil)
		state.backupScheduler = lifecycle.NewBackupScheduler(state.backupManager, nil)
	}

	window.ConnectCloseRequest(func() (ok bool) {
		if state.thumbnailSvc != nil {
			state.thumbnailSvc.Close()
		}
		if state.backupScheduler != nil {
			state.backupScheduler.Stop()
		}
		return false
	})

	// Create library view
	state.libraryView = ui.NewLibraryView()
	stack.AddNamed(state.libraryView.Widget(), "library")

	// Create playback window
	state.playbackWindow = ui.NewPlaybackWindow()
	stack.AddNamed(state.playbackWindow.Widget(), "playback")

	window.SetChild(stack)

	setupFileMenu(app, window, state)
	setupToolsMenu(app, window, state)
	setupPlaybackControls(window, state)
	setupTranscription(state)
	setupLibraryView(state)

	window.Show()

	// Show library if we have a database, otherwise show file dialog
	if recordingSvc != nil {
		showLibraryView(state)
	} else {
		showOpenFileDialog(window, state)
	}
}

func configureMainWindowDefaults(window *gtk.Window) {
	window.SetDefaultSize(1000, 640)
	window.SetResizable(true)
}

func showLibraryView(state *appState) {
	if state.recordingSvc == nil {
		// No database, show file dialog instead
		showOpenFileDialog(state.window, state)
		return
	}

	// Load recordings from database
	recordings, err := state.recordingSvc.GetLibrary()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to load library: %v\n", err)
		recordings = []*db.Recording{}
	}

	state.libraryView.SetRecordings(recordings)
	scheduleThumbnailGeneration(state, recordings)
	state.stack.SetVisibleChildName("library")
}

func showPlaybackView(state *appState) {
	state.stack.SetVisibleChildName("playback")
}

func setupLibraryView(state *appState) {
	if state.libraryView == nil {
		return
	}

	// Handle recording selection
	state.libraryView.OnRecordingSelected(func(rec *db.Recording) {
		loadRecordingFromLibrary(state, rec)
	})

	// Handle recording deletion
	state.libraryView.OnRecordingDelete(func(rec *db.Recording) {
		// Delete from database
		if state.recordingSvc != nil {
			if err := state.recordingSvc.Delete(rec.ID); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: Failed to delete recording: %v\n", err)
				return
			}
		}

		// Refresh library view
		showLibraryView(state)
	})

	// Handle recording export
	state.libraryView.OnRecordingExport(func(rec *db.Recording) {
		showExportDialogForRecording(state.window, state, rec)
	})

	// Handle open file button
	state.libraryView.OnOpenFile(func() {
		showOpenFileDialog(state.window, state)
	})

	// Handle search
	state.libraryView.OnSearch(func(query string) {
		if state.recordingSvc == nil {
			return
		}

		var recordings []*db.Recording
		var err error

		if query == "" {
			recordings, err = state.recordingSvc.GetLibrary()
		} else {
			recordings, err = state.recordingSvc.Search(query)
		}

		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Search failed: %v\n", err)
			recordings = []*db.Recording{}
		}

		state.libraryView.SetRecordings(recordings)
		scheduleThumbnailGeneration(state, recordings)
	})
}

func scheduleThumbnailGeneration(state *appState, recordings []*db.Recording) {
	if state.thumbnailSvc == nil || state.libraryView == nil {
		return
	}

	for _, rec := range recordings {
		if rec == nil {
			continue
		}

		accepted := state.thumbnailSvc.Enqueue(rec, func(recordingID int64, image *thumbnail.Image, err error) {
			glib.IdleAdd(func() {
				if err != nil || image == nil {
					if err != nil {
						fmt.Fprintf(os.Stderr, "Warning: Thumbnail generation failed for recording %d: %v\n", recordingID, err)
					}
					state.libraryView.ShowThumbnailPlaceholder(recordingID)
					return
				}

				state.libraryView.UpdateThumbnail(recordingID, image.Base64Data, image.MIMEType, image.GeneratedAt)
			})
		})

		if accepted {
			state.libraryView.SetThumbnailLoading(rec.ID, true)
		}
	}
}

func loadRecordingFromLibrary(state *appState, rec *db.Recording) {
	openRecordingPath(state, rec.FilePath)
}

func setupFileMenu(app *gtk.Application, window *gtk.ApplicationWindow, state *appState) {
	openAction := gio.NewSimpleAction("open", nil)
	openAction.ConnectActivate(func(_ *glib.Variant) {
		showOpenFileDialog(window, state)
	})
	app.AddAction(openAction)

	app.SetAccelsForAction("app.open", []string{"<Ctrl>o"})

	// Back to Library action (only works if database is available)
	libraryAction := gio.NewSimpleAction("library", nil)
	libraryAction.ConnectActivate(func(_ *glib.Variant) {
		showLibraryView(state)
	})
	app.AddAction(libraryAction)
	app.SetAccelsForAction("app.library", []string{"<Ctrl>l"})

	transcribeAction := gio.NewSimpleAction("transcribe", nil)
	transcribeAction.ConnectActivate(func(_ *glib.Variant) {
		runTranscription(state)
	})
	app.AddAction(transcribeAction)
	app.SetAccelsForAction("app.transcribe", []string{"<Ctrl>t"})

	// Settings/Preferences action
	settingsAction := gio.NewSimpleAction("preferences", nil)
	settingsAction.ConnectActivate(func(_ *glib.Variant) {
		showSettingsWindow(window, state)
	})
	app.AddAction(settingsAction)
	app.SetAccelsForAction("app.preferences", []string{"<Ctrl>comma"})

	// Export action - only works if database is available
	exportAction := gio.NewSimpleAction("export", nil)
	exportAction.ConnectActivate(func(_ *glib.Variant) {
		showExportDialog(window, state)
	})
	app.AddAction(exportAction)
	app.SetAccelsForAction("app.export", []string{"<Ctrl><Shift>e"})

	// Import action - only works if database is available
	importAction := gio.NewSimpleAction("import", nil)
	importAction.ConnectActivate(func(_ *glib.Variant) {
		showImportDialog(window, state)
	})
	app.AddAction(importAction)
	app.SetAccelsForAction("app.import", []string{"<Ctrl><Shift>i"})

	// Backup Settings action - only works if database is available
	backupAction := gio.NewSimpleAction("backup-settings", nil)
	backupAction.ConnectActivate(func(_ *glib.Variant) {
		showBackupSettingsDialog(window, state)
	})
	app.AddAction(backupAction)
	app.SetAccelsForAction("app.backup-settings", []string{"<Ctrl><Shift>b"})
}

// setupToolsMenu sets up the Tools menu actions
func setupToolsMenu(app *gtk.Application, window *gtk.ApplicationWindow, state *appState) {
	// Repair action - only works if database is available
	repairAction := gio.NewSimpleAction("repair", nil)
	repairAction.ConnectActivate(func(_ *glib.Variant) {
		showRepairDialog(window, state)
	})
	app.AddAction(repairAction)
	app.SetAccelsForAction("app.repair", []string{"<Ctrl><Shift>r"})
}

func showSettingsWindow(parent *gtk.ApplicationWindow, state *appState) {
	if state.settingsSvc == nil {
		return
	}

	// Load current settings
	currentSettings, err := state.settingsSvc.LoadSettingsOrDefault()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to load settings: %v\n", err)
		currentSettings = settings.CreateDefaultSettings()
	}

	// Create and show settings window
	settingsWindow := ui.NewSettingsWindow(&parent.Window)
	settingsWindow.SetSettings(currentSettings)

	// Wire up test callback
	settingsWindow.SetOnTest(func(config settings.ProviderConfig) error {
		return state.settingsSvc.TestProviderConnection(config)
	})

	// Wire up save callback
	settingsWindow.SetOnSave(func(s *settings.Settings) {
		if err := state.settingsSvc.SaveSettings(s); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Failed to save settings: %v\n", err)
		}
	})

	settingsWindow.Show()
}

func showOpenFileDialog(window *gtk.ApplicationWindow, state *appState) {
	dialog := gtk.NewFileChooserNative("Open Video File", &window.Window, gtk.FileChooserActionOpen, "Open", "Cancel")

	filter := gtk.NewFileFilter()
	filter.SetName("Video Files")
	filter.AddPattern("*.mp4")
	filter.AddPattern("*.mkv")
	filter.AddPattern("*.webm")
	filter.AddPattern("*.avi")
	filter.AddPattern("*.mov")
	dialog.AddFilter(filter)

	allFilter := gtk.NewFileFilter()
	allFilter.SetName("All Files")
	allFilter.AddPattern("*")
	dialog.AddFilter(allFilter)

	dialog.ConnectResponse(func(responseID int) {
		if responseID == int(gtk.ResponseAccept) {
			file := dialog.File()
			if file == nil {
				return
			}
			openRecordingPath(state, file.Path())
		}
	})

	dialog.Show()
}

func openRecordingPath(state *appState, videoPath string) bool {
	loaded := loadRecording(state, videoPath)
	showPlaybackView(state)
	return loaded
}

func loadRecording(state *appState, videoPath string) bool {
	state.currentPath = videoPath

	result := state.loader.LoadRecording(videoPath)
	if !result.Exists {
		state.playbackWindow.ShowError(fmt.Sprintf("File not found: %s", videoPath))
		return false
	}

	state.playbackWindow.ClearError()

	// Add/update recording in database
	if state.recordingSvc != nil {
		_, err := state.recordingSvc.AddRecording(videoPath, time.Duration(result.Duration*float64(time.Second)))
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Failed to add recording to library: %v\n", err)
		}
	}

	if result.HasTranscription && result.Transcription != nil {
		state.editableView = ui.NewEditableTranscriptionView()
		state.editableView.SetResult(result.Transcription)
		state.playbackWindow.SetEditableTranscription(state.editableView)
		state.wordContainer = state.editableView.GetWordContainer()
		state.wordContainer.SetWordClickHandler(func(startTime float64, index int) {
			if state.syncIntegration != nil {
				state.syncIntegration.HandleWordClick(startTime, index)
			}
		})
	} else {
		state.editableView = ui.NewEditableTranscriptionView()
		state.editableView.SetStatus("No transcription yet - press Ctrl+T to transcribe")
		state.playbackWindow.SetEditableTranscription(state.editableView)
	}

	if err := setupPlaybackPipeline(state, videoPath); err != nil {
		state.playbackWindow.ShowError(fmt.Sprintf("Failed to load video: %v", err))
		return false
	}

	if result.HasTranscription && result.Transcription != nil {
		setupSyncIntegration(state, result.Transcription)
	}

	return true
}

func setupPlaybackPipeline(state *appState, videoPath string) error {
	if state.playback != nil {
		_ = state.playback.Close()
	}

	pipeline, err := media.NewPlaybackPipeline(videoPath)
	if err != nil {
		return fmt.Errorf("failed to create playback pipeline: %w", err)
	}
	state.playback = pipeline

	sink := gst.ElementFactoryMake("gtk4paintablesink", "video-sink")
	if sink != nil {
		paintableObj := sink.ObjectProperty("paintable")
		if paintable, ok := paintableObj.(*gdk.Paintable); ok {
			picture := gtk.NewPictureForPaintable(paintable)
			state.playbackWindow.SetVideoWidget(&picture.Widget)
			state.monitor = media.NewPositionMonitor(pipeline, 100)
			return nil
		}
	}

	placeholder := gtk.NewLabel(fmt.Sprintf("Video loaded: %s\nPress Play to start playback.", filepath.Base(videoPath)))
	placeholder.SetWrap(true)
	placeholder.SetHExpand(true)
	placeholder.SetVExpand(true)
	placeholder.SetHAlign(gtk.AlignCenter)
	placeholder.SetVAlign(gtk.AlignCenter)
	placeholder.AddCSSClass("dim-label")
	state.playbackWindow.SetVideoWidget(&placeholder.Widget)

	state.monitor = media.NewPositionMonitor(pipeline, 100)

	return nil
}

func showExportFileDialog(window *gtk.ApplicationWindow, state *appState, segments []ui.Segment) {
	dialog := gtk.NewFileChooserNative("Export Video", &window.Window, gtk.FileChooserActionSave, "Export", "Cancel")
	dialog.SetCurrentName("export_" + filepath.Base(state.currentPath))

	filter := gtk.NewFileFilter()
	filter.SetName("Video Files")
	filter.AddPattern("*.mp4")
	filter.AddPattern("*.mkv")
	filter.AddPattern("*.webm")
	dialog.AddFilter(filter)

	dialog.ConnectResponse(func(responseID int) {
		if responseID == int(gtk.ResponseAccept) {
			outputPath := dialog.File().Path()
			runExport(state, segments, outputPath)
		}
	})

	dialog.Show()
}

func runExport(state *appState, segments []ui.Segment, outputPath string) {
	mediaSegments := convertToMediaSegments(segments, outputPath)

	exporter := media.NewSegmentExporter(state.currentPath)

	exporter.SetProgressHandler(func(percent float64) {
		glib.IdleAdd(func() {
			state.playbackWindow.ClearError()
			state.playbackWindow.ShowError(fmt.Sprintf("Exporting: %.0f%%", percent*100))
		})
	})

	exporter.SetCompleteHandler(func(outputPath string) {
		glib.IdleAdd(func() {
			state.playbackWindow.ClearError()
			state.playbackWindow.ShowError(fmt.Sprintf("Export saved to: %s", outputPath))
		})
	})

	exporter.SetErrorHandler(func(err error) {
		glib.IdleAdd(func() {
			state.playbackWindow.ShowError(fmt.Sprintf("Export failed: %v", err))
		})
	})

	exporter.ExportSegments(mediaSegments, outputPath)
}

func convertToMediaSegments(segments []ui.Segment, outputPath string) []media.Segment {
	result := make([]media.Segment, len(segments))
	for i, seg := range segments {
		result[i] = media.Segment{
			StartTime:  seg.StartTime,
			EndTime:    seg.EndTime,
			OutputPath: outputPath,
		}
	}
	return result
}

func setupPlaybackControls(window *gtk.ApplicationWindow, state *appState) {
	state.playbackWindow.SetPlayCallback(func() {
		if state.playback == nil {
			return
		}
		if err := state.playback.Play(); err != nil {
			glib.IdleAdd(func() {
				state.playbackWindow.ShowError(fmt.Sprintf("Failed to play: %v", err))
			})
			return
		}
		if state.monitor != nil {
			state.monitor.Start()
		}
	})

	state.playbackWindow.SetPauseCallback(func() {
		if state.playback == nil {
			return
		}
		if err := state.playback.Pause(); err != nil {
			glib.IdleAdd(func() {
				state.playbackWindow.ShowError(fmt.Sprintf("Failed to pause: %v", err))
			})
		}
	})

	state.playbackWindow.SetStopCallback(func() {
		if state.playback == nil {
			return
		}
		if err := state.playback.Stop(); err != nil {
			glib.IdleAdd(func() {
				state.playbackWindow.ShowError(fmt.Sprintf("Failed to stop: %v", err))
			})
		}
		if state.monitor != nil {
			state.monitor.Stop()
		}
	})

	state.playbackWindow.SetSeekCallback(func(position float64) {
		if state.playback == nil {
			return
		}
		duration := state.playback.QueryDuration()
		if duration > 0 {
			seconds := (position / 100.0) * duration
			state.playback.SeekTo(seconds)
		}
	})

	state.playbackWindow.SetExportSegmentsCallback(func(segments []ui.Segment) {
		if state.currentPath == "" {
			return
		}
		showExportFileDialog(window, state, segments)
	})
}

func setupTranscription(state *appState) {
}

func setupSyncIntegration(state *appState, result *ai.TranscriptionResult) {
	controller := sync.NewController(result)

	highlighter := &uiSyncAdapter{
		setHighlighted: func(idx int) {
			glib.IdleAdd(func() {
				if state.wordContainer != nil {
					state.wordContainer.SetHighlightedWord(idx)
				}
			})
		},
		getHighlighted: func() int {
			if state.wordContainer == nil {
				return -1
			}
			return state.wordContainer.GetHighlightedWord()
		},
	}

	player := &playbackSyncAdapter{
		play: func() {
			if state.playback != nil {
				_ = state.playback.Play()
			}
		},
		pause: func() {
			if state.playback != nil {
				_ = state.playback.Pause()
			}
		},
		seekTo: func(pos float64) bool {
			if state.playback == nil {
				return false
			}
			return state.playback.SeekTo(pos)
		},
		queryPosition: func() float64 {
			if state.playback == nil {
				return -1
			}
			return state.playback.QueryPosition()
		},
	}

	waveform := &waveformSyncAdapter{
		updatePosition: func(pos float64) {
			state.playbackWindow.UpdateWaveformPosition(time.Duration(pos * float64(time.Second)))
		},
	}

	state.syncIntegration = sync.NewIntegration(controller, state.monitor, highlighter, waveform, player)

	controller.RegisterPositionCallback(func(position float64) {
		glib.IdleAdd(func() {
			if state.playback != nil {
				duration := state.playback.QueryDuration()
				state.playbackWindow.UpdateSeekSlider(position, duration)
				state.playbackWindow.UpdateTimeDisplay(position, duration)
			}
		})
	})
}

func runTranscription(state *appState) {
	if state.currentPath == "" {
		glib.IdleAdd(func() {
			state.playbackWindow.ShowError("No video file loaded")
		})
		return
	}

	if state.editableView == nil {
		state.editableView = ui.NewEditableTranscriptionView()
		state.playbackWindow.SetEditableTranscription(state.editableView)
	}

	// Try to get provider from settings first, then fall back to environment
	var provider ai.Provider
	var err error

	if state.settingsSvc != nil {
		s, err := state.settingsSvc.LoadSettingsOrDefault()
		if err == nil {
			provider, err = state.aiFactory.CreateProviderFromSettings(s)
		}
		if err != nil {
			provider, err = ai.NewProviderFromEnv()
		}
	} else {
		provider, err = ai.NewProviderFromEnv()
	}

	if err != nil {
		glib.IdleAdd(func() {
			state.editableView.SetError(err)
		})
		return
	}

	svc := transcription.NewService(provider)
	svc.SetProgressCallback(func(msg string) {
		glib.IdleAdd(func() {
			state.editableView.SetStatus(msg)
		})
	})

	glib.IdleAdd(func() {
		state.editableView.SetStatus("Preparing transcription...")
		state.editableView.Show()
	})

	go func() {
		result, err := svc.TranscribeFile(context.Background(), state.currentPath)
		if err != nil {
			meta := transcription.NewRecordingMetadata(state.currentPath)
			meta.SetTranscribeError(err)
			_ = meta.Save()

			// Update database with error status
			if state.recordingSvc != nil {
				errorData, _ := json.Marshal(map[string]string{"error": err.Error()})
				rec, lookupErr := state.recordingSvc.GetByPath(state.currentPath)
				if lookupErr == nil {
					_ = state.recordingSvc.UpdateTranscriptionStatus(rec.ID, "error", string(errorData))
				} else if !errors.Is(lookupErr, sql.ErrNoRows) {
					fmt.Fprintf(os.Stderr, "Warning: Failed to lookup recording by exact path: %v\n", lookupErr)
				}
			}

			glib.IdleAdd(func() {
				state.editableView.SetError(err)
			})
			return
		}

		meta := transcription.NewRecordingMetadata(state.currentPath)
		meta.SetTranscription(result)
		_ = meta.Save()

		// Update database with transcription
		if state.recordingSvc != nil {
			// Convert result to JSON for storage
			jsonData, _ := json.Marshal(result)

			rec, lookupErr := state.recordingSvc.GetByPath(state.currentPath)
			if lookupErr == nil {
				_ = state.recordingSvc.UpdateTranscriptionStatus(rec.ID, "completed", string(jsonData))
			} else if !errors.Is(lookupErr, sql.ErrNoRows) {
				fmt.Fprintf(os.Stderr, "Warning: Failed to lookup recording by exact path: %v\n", lookupErr)
			}
		}

		glib.IdleAdd(func() {
			state.editableView.SetResult(result)
			state.wordContainer = state.editableView.GetWordContainer()
			state.wordContainer.SetWordClickHandler(func(startTime float64, index int) {
				if state.syncIntegration != nil {
					state.syncIntegration.HandleWordClick(startTime, index)
				}
			})

			setupSyncIntegration(state, result)
			if state.monitor != nil {
				state.syncIntegration.Start()
			}
		})
	}()
}

type uiSyncAdapter struct {
	setHighlighted func(int)
	getHighlighted func() int
}

func (a *uiSyncAdapter) SetHighlightedWord(idx int) {
	if a.setHighlighted != nil {
		a.setHighlighted(idx)
	}
}

func (a *uiSyncAdapter) GetHighlightedWord() int {
	if a.getHighlighted != nil {
		return a.getHighlighted()
	}
	return -1
}

type playbackSyncAdapter struct {
	play          func()
	pause         func()
	seekTo        func(float64) bool
	queryPosition func() float64
}

func (a *playbackSyncAdapter) Play() {
	if a.play != nil {
		a.play()
	}
}

func (a *playbackSyncAdapter) Pause() {
	if a.pause != nil {
		a.pause()
	}
}

func (a *playbackSyncAdapter) SeekTo(pos float64) bool {
	if a.seekTo != nil {
		return a.seekTo(pos)
	}
	return false
}

func (a *playbackSyncAdapter) QueryPosition() float64 {
	if a.queryPosition != nil {
		return a.queryPosition()
	}
	return -1
}

// waveformSyncAdapter adapts PlaybackWindow to sync.WaveformUpdater interface
type waveformSyncAdapter struct {
	updatePosition func(float64)
}

func (a *waveformSyncAdapter) UpdatePosition(position float64) {
	if a.updatePosition != nil {
		a.updatePosition(position)
	}
}

// showExportDialog shows the export dialog for exporting recordings
func showExportDialog(window *gtk.ApplicationWindow, state *appState) {
	if state.recordingSvc == nil {
		return
	}

	dialog := ui.NewExportDialog(&window.Window)

	dialog.SetOnExport(func(recordingID, destPath string) {
		go func() {
			// Simulate export progress
			for i := 0; i <= 100; i += 10 {
				glib.IdleAdd(func(percent int) func() {
					return func() {
						dialog.UpdateProgress(percent, fmt.Sprintf("Exporting... %d%%", percent))
					}
				}(i))
				time.Sleep(100 * time.Millisecond)
			}

			glib.IdleAdd(func() {
				dialog.UpdateProgress(100, "Export complete!")
				dialog.SetExportingState(false)
			})
		}()
	})

	dialog.SetOnCancel(func() {
		// Cancel any ongoing export
	})

	dialog.Show()
}

// showExportDialogForRecording shows the export dialog for a specific recording
func showExportDialogForRecording(window *gtk.ApplicationWindow, state *appState, rec *db.Recording) {
	if state.recordingSvc == nil || rec == nil {
		return
	}

	dialog := ui.NewExportDialog(&window.Window)
	dialog.SetRecording(rec)

	dialog.SetOnExport(func(recordingID, destPath string) {
		go func() {
			// Simulate export progress
			for i := 0; i <= 100; i += 10 {
				glib.IdleAdd(func(percent int) func() {
					return func() {
						dialog.UpdateProgress(percent, fmt.Sprintf("Exporting... %d%%", percent))
					}
				}(i))
				time.Sleep(100 * time.Millisecond)
			}

			glib.IdleAdd(func() {
				dialog.UpdateProgress(100, "Export complete!")
				dialog.SetExportingState(false)
			})
		}()
	})

	dialog.SetOnCancel(func() {
		// Cancel any ongoing export
	})

	dialog.Show()
}

// showImportDialog shows the import dialog for importing recordings
func showImportDialog(window *gtk.ApplicationWindow, state *appState) {
	if state.recordingSvc == nil {
		return
	}

	dialog := ui.NewImportDialog(&window.Window)

	dialog.SetOnImport(func(archivePath string, handling lifecycle.DuplicateHandling) {
		go func() {
			// Simulate import progress
			for i := 0; i <= 100; i += 10 {
				glib.IdleAdd(func(percent int) func() {
					return func() {
						dialog.UpdateProgress(percent, fmt.Sprintf("Importing... %d%%", percent))
					}
				}(i))
				time.Sleep(100 * time.Millisecond)
			}

			// Create a mock result
			result := &lifecycle.ImportResult{
				ImportedCount: 1,
				SkippedCount:  0,
				ReplacedCount: 0,
				Errors:        []error{},
				ImportedIDs:   []string{"imported-1"},
			}

			glib.IdleAdd(func() {
				dialog.SetResult(result)
				dialog.SetImportingState(false)
			})
		}()
	})

	dialog.SetOnCancel(func() {
		// Cancel any ongoing import
	})

	dialog.Show()
}

// showRepairDialog shows the repair dialog for database maintenance
func showRepairDialog(window *gtk.ApplicationWindow, state *appState) {
	if state.recordingSvc == nil {
		return
	}

	dialog := ui.NewRepairDialog(&window.Window)

	dialog.SetOnScan(func() {
		go func() {
			// Simulate scan progress
			glib.IdleAdd(func() {
				dialog.UpdateProgress(50, "Scanning database...")
			})
			time.Sleep(500 * time.Millisecond)

			// Create a mock inspection report (no issues found)
			report := &lifecycle.InspectionReport{
				TotalIssues:           0,
				OrphanedRecordings:    []*db.Recording{},
				MissingThumbnails:     []*db.Recording{},
				InvalidTranscriptions: []*db.Recording{},
			}

			glib.IdleAdd(func() {
				dialog.SetInspectionReport(report)
			})
		}()
	})

	dialog.SetOnRepair(func(options ui.RepairOptions) {
		go func() {
			// Simulate repair progress
			for i := 0; i <= 100; i += 20 {
				glib.IdleAdd(func(percent int) func() {
					return func() {
						dialog.UpdateProgress(percent, fmt.Sprintf("Repairing... %d%%", percent))
					}
				}(i))
				time.Sleep(100 * time.Millisecond)
			}

			// Create a mock repair report
			report := &lifecycle.RepairReport{
				TotalRepairs:          0,
				RemovedOrphans:        []int64{},
				MarkedUnavailable:     []int64{},
				RegeneratedThumbnails: []int64{},
				Errors:                []string{},
			}

			glib.IdleAdd(func() {
				dialog.SetRepairReport(report)
			})
		}()
	})

	dialog.SetOnClose(func() {
		// Refresh library view after repair
		showLibraryView(state)
	})

	dialog.Show()
}

// showBackupSettingsDialog shows the backup settings dialog
func showBackupSettingsDialog(window *gtk.ApplicationWindow, state *appState) {
	if state.backupManager == nil {
		return
	}

	dialog := ui.NewBackupSettingsDialog(&window.Window)

	// Set current values from backup manager/scheduler
	dialog.SetAutoBackupEnabled(state.backupScheduler.IsRunning())
	dialog.SetFrequency(state.backupScheduler.GetFrequency())
	dialog.SetRetentionCount(state.backupManager.GetRetentionCount())
	dialog.SetBackupDir(state.backupManager.GetBackupDir())

	// Update last/next backup times if available
	if !state.backupScheduler.GetLastBackupTime().IsZero() {
		dialog.UpdateLastBackupTime(state.backupScheduler.GetLastBackupTime())
	}
	if !state.backupScheduler.GetNextBackupTime().IsZero() {
		dialog.UpdateNextBackupTime(state.backupScheduler.GetNextBackupTime())
	}

	// Handle save
	dialog.SetOnSave(func(enabled bool, freq lifecycle.BackupFrequency, retention int, backupDir string) {
		// Update backup manager settings
		state.backupManager.SetRetentionCount(retention)

		// Update scheduler frequency and start/stop as needed
		state.backupScheduler.SetFrequency(freq)

		if enabled && !state.backupScheduler.IsRunning() {
			state.backupScheduler.Start()
		} else if !enabled && state.backupScheduler.IsRunning() {
			state.backupScheduler.Stop()
		}

		// If backup directory changed, recreate manager with new path
		if backupDir != state.backupManager.GetBackupDir() && backupDir != "" {
			if state.backupScheduler.IsRunning() {
				state.backupScheduler.Stop()
			}
			dbPath := state.backupManager.GetDBPath()
			// Use NewBackupManagerWithDB to maintain atomic backup capability
			var dbConn *sql.DB
			if state.db != nil {
				dbConn = state.db.GetDB()
			}
			state.backupManager = lifecycle.NewBackupManagerWithDB(dbPath, backupDir, dbConn, nil)
			state.backupScheduler = lifecycle.NewBackupScheduler(state.backupManager, nil)
			if enabled {
				state.backupScheduler.Start()
			}
		}
	})

	// Handle manual backup
	dialog.SetOnManualBackup(func() (string, error) {
		return state.backupScheduler.TriggerBackup()
	})

	dialog.Show()
}
