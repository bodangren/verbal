package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"verbal/internal/ai"
	"verbal/internal/db"
	"verbal/internal/media"
	"verbal/internal/settings"
	"verbal/internal/sync"
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
	settingsSvc     *settings.Service
	aiFactory       *ai.Factory
}

func main() {
	homeDir, _ := os.UserHomeDir()
	if homeDir != "" {
		envPath := filepath.Join(homeDir, ".config", "verbal", ".env")
		_ = ai.LoadEnvFromFile(envPath)
	}

	execDir, _ := filepath.Abs(filepath.Dir(os.Args[0]))
	if execDir != "" {
		_ = ai.LoadEnvFromFile(filepath.Join(execDir, ".env"))
	}
	_ = ai.LoadEnvFromFile(".env")

	// Initialize database
	var database *db.Database
	if homeDir != "" {
		dbPath := filepath.Join(homeDir, ".config", "verbal", "recordings.db")
		var err error
		database, err = db.NewDatabase(dbPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Failed to initialize database: %v\n", err)
			database = nil
		}
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

func activate(app *gtk.Application, database *db.Database) {
	ui.LoadApplicationCSS()

	window := gtk.NewApplicationWindow(app)
	window.SetTitle("Verbal - Video Transcription Editor")
	window.SetDefaultSize(1200, 700)

	var recordingSvc *db.RecordingService
	var settingsSvc *settings.Service
	var aiFactory *ai.Factory
	if database != nil {
		recordingSvc = db.NewRecordingService(database)
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
		settingsSvc:  settingsSvc,
		aiFactory:    aiFactory,
	}

	// Create library view
	state.libraryView = ui.NewLibraryView()
	stack.AddNamed(state.libraryView.Widget(), "library")

	// Create playback window
	state.playbackWindow = ui.NewPlaybackWindow()
	stack.AddNamed(state.playbackWindow.Widget(), "playback")

	window.SetChild(stack)

	setupFileMenu(app, window, state)
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
	})
}

func loadRecordingFromLibrary(state *appState, rec *db.Recording) {
	// Update current path
	state.currentPath = rec.FilePath

	// Load the recording
	loadRecording(state, rec.FilePath)

	// Switch to playback view
	showPlaybackView(state)
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
			path := dialog.File().Path()
			loadRecording(state, path)
		}
	})

	dialog.Show()
}

func loadRecording(state *appState, videoPath string) {
	state.currentPath = videoPath

	result := state.loader.LoadRecording(videoPath)
	if !result.Exists {
		state.playbackWindow.ShowError(fmt.Sprintf("File not found: %s", videoPath))
		return
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

		wordData := result.WordData
		state.wordContainer = ui.NewWordContainer(wordData)
		state.wordContainer.SetWordClickHandler(func(startTime float64, index int) {
			if state.syncIntegration != nil {
				state.syncIntegration.HandleWordClick(startTime, index)
			}
		})

		if state.editableView != nil {
			state.editableView.SetResult(result.Transcription)
		}
	} else {
		state.editableView = ui.NewEditableTranscriptionView()
		state.editableView.SetStatus("No transcription yet - press Ctrl+T to transcribe")
		state.playbackWindow.SetEditableTranscription(state.editableView)
	}

	if err := setupPlaybackPipeline(state, videoPath); err != nil {
		state.playbackWindow.ShowError(fmt.Sprintf("Failed to load video: %v", err))
		return
	}

	if result.HasTranscription && result.Transcription != nil {
		setupSyncIntegration(state, result.Transcription)
	}
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
		}
	}

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
				// Find recording by path and update status
				recordings, _ := state.recordingSvc.Search(state.currentPath)
				for _, rec := range recordings {
					if rec.FilePath == state.currentPath {
						rec.TranscriptionStatus = "error"
						errorData, _ := json.Marshal(map[string]string{"error": err.Error()})
						_ = state.recordingSvc.UpdateTranscription(rec.ID, string(errorData))
						break
					}
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

			// Find recording by path and update
			recordings, _ := state.recordingSvc.Search(state.currentPath)
			for _, rec := range recordings {
				if rec.FilePath == state.currentPath {
					_ = state.recordingSvc.UpdateTranscription(rec.ID, string(jsonData))
					break
				}
			}
		}

		glib.IdleAdd(func() {
			state.editableView.SetResult(result)

			wordData := make([]ui.WordData, len(result.Words))
			for i, w := range result.Words {
				wordData[i] = ui.WordData{
					Text:      w.Text,
					StartTime: w.Start,
					EndTime:   w.End,
					Index:     i,
				}
			}
			state.wordContainer = ui.NewWordContainer(wordData)
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
