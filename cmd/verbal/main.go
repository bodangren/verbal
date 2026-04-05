package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"verbal/internal/ai"
	"verbal/internal/media"
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
	playbackWindow  *ui.PlaybackWindow
	playback        *media.PlaybackPipeline
	monitor         *media.PositionMonitor
	syncIntegration *sync.Integration
	wordContainer   *ui.WordContainer
	editableView    *ui.EditableTranscriptionView
	loader          *ui.RecordingLoader
	currentPath     string
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

	app := gtk.NewApplication("com.verbal.editor", gio.ApplicationFlagsNone)
	app.ConnectActivate(func() {
		activate(app)
	})

	if code := app.Run(os.Args); code > 0 {
		os.Exit(code)
	}
}

func activate(app *gtk.Application) {
	ui.LoadApplicationCSS()

	window := gtk.NewApplicationWindow(app)
	window.SetTitle("Verbal - Video Transcription Editor")
	window.SetDefaultSize(1200, 700)

	state := &appState{
		loader: ui.NewRecordingLoader(),
	}

	state.playbackWindow = ui.NewPlaybackWindow()
	window.SetChild(state.playbackWindow.Widget())

	setupFileMenu(app, window, state)
	setupPlaybackControls(window, state)
	setupTranscription(state)

	window.Show()
	showOpenFileDialog(window, state)
}

func setupFileMenu(app *gtk.Application, window *gtk.ApplicationWindow, state *appState) {
	openAction := gio.NewSimpleAction("open", nil)
	openAction.ConnectActivate(func(_ *glib.Variant) {
		showOpenFileDialog(window, state)
	})
	app.AddAction(openAction)

	app.SetAccelsForAction("app.open", []string{"<Ctrl>o"})

	transcribeAction := gio.NewSimpleAction("transcribe", nil)
	transcribeAction.ConnectActivate(func(_ *glib.Variant) {
		runTranscription(state)
	})
	app.AddAction(transcribeAction)
	app.SetAccelsForAction("app.transcribe", []string{"<Ctrl>t"})
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

	state.syncIntegration = sync.NewIntegration(controller, state.monitor, highlighter, player)

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

	provider, err := ai.NewProviderFromEnv()
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
			glib.IdleAdd(func() {
				state.editableView.SetError(err)
			})
			return
		}

		meta := transcription.NewRecordingMetadata(state.currentPath)
		meta.SetTranscription(result)
		_ = meta.Save()

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
