package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"verbal/internal/ai"
	"verbal/internal/media"
	"verbal/internal/transcription"
	"verbal/internal/ui"

	"github.com/diamondburned/gotk4/pkg/gio/v2"
	"github.com/diamondburned/gotk4/pkg/glib/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

var useEmbeddedPreview = media.HasGtk4PaintableSink()

func main() {
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
	window.SetTitle("Verbal")
	window.SetDefaultSize(800, 600)

	header := gtk.NewHeaderBar()
	header.SetTitleWidget(gtk.NewLabel("Verbal"))
	window.SetTitlebar(header)

	var pipeline *media.Pipeline
	var embeddedPipeline *media.EmbeddedPipeline
	var videoPreview *ui.VideoPreview

	if useEmbeddedPreview {
		videoPreview = ui.NewVideoPreview()
		var err error
		embeddedPipeline, err = media.NewEmbeddedPreviewPipelineWithFallback(
			media.PreviewConfig{UseHardware: media.HasVideoDevice()},
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to create embedded pipeline: %v, falling back to external\n", err)
			useEmbeddedPreview = false
			pipeline, _ = media.NewPreviewPipelineWithFallback()
		} else {
			videoPreview.SetPipeline(embeddedPipeline)
		}
	} else {
		var err error
		pipeline, err = media.NewPreviewPipelineWithFallback()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to create pipeline: %v\n", err)
		}
	}

	var recordingPipeline *media.RecordingPipeline

	titleLabel := gtk.NewLabel("Text-Based Video Editor")
	titleLabel.AddCSSClass("title-1")
	titleLabel.AddCSSClass("title-label")

	statusLabel := gtk.NewLabel("Ready")
	statusLabel.AddCSSClass("dim-label")
	statusLabel.AddCSSClass("status-label")

	startButton := gtk.NewButtonWithLabel("Start Preview")
	startButton.AddCSSClass("suggested-action")
	startButton.AddCSSClass("action-button")

	pauseButton := gtk.NewButtonWithLabel("Pause")
	pauseButton.AddCSSClass("action-button")
	pauseButton.SetSensitive(false)

	stopButton := gtk.NewButtonWithLabel("Stop Preview")
	stopButton.AddCSSClass("action-button")
	stopButton.SetSensitive(false)

	recordButton := gtk.NewButtonWithLabel("Record")
	recordButton.AddCSSClass("destructive-action")
	recordButton.AddCSSClass("action-button")

	transcribeButton := gtk.NewButtonWithLabel("Transcribe")
	transcribeButton.AddCSSClass("action-button")
	transcribeButton.SetSensitive(false)

	recordingLabel := gtk.NewLabel("")
	recordingLabel.AddCSSClass("dim-label")

	transcriptionView := ui.NewTranscriptionView()

	var lastRecordingPath string
	var transcribeSvc *transcription.Service

	if provider, err := ai.NewProviderFromEnv(); err == nil {
		transcribeSvc = transcription.NewService(provider)
	} else {
		transcribeButton.SetTooltipText("No AI provider configured")
	}

	updateControls := func() {
		var state media.PipelineState
		var usesHardware bool

		if useEmbeddedPreview && embeddedPipeline != nil {
			state = embeddedPipeline.GetState()
			usesHardware = embeddedPipeline.UsesHardware()
		} else if pipeline != nil {
			state = pipeline.GetState()
			usesHardware = pipeline.UsesHardware()
		} else {
			startButton.SetSensitive(false)
			pauseButton.SetSensitive(false)
			stopButton.SetSensitive(false)
			statusLabel.SetText("Error: Pipeline not initialized")
			return
		}

		sourceType := "test source"
		if usesHardware {
			sourceType = "hardware"
		}

		switch state {
		case media.StatePlaying:
			startButton.SetSensitive(false)
			pauseButton.SetSensitive(true)
			stopButton.SetSensitive(true)
			statusLabel.SetText(fmt.Sprintf("Preview running (%s)...", sourceType))
		case media.StatePaused:
			startButton.SetSensitive(true)
			pauseButton.SetSensitive(false)
			stopButton.SetSensitive(true)
			statusLabel.SetText(fmt.Sprintf("Preview paused (%s)", sourceType))
		case media.StateStopped:
			startButton.SetSensitive(true)
			pauseButton.SetSensitive(false)
			stopButton.SetSensitive(false)
			if media.HasVideoDevice() {
				statusLabel.SetText("Ready (hardware available)")
			} else {
				statusLabel.SetText("Ready (test source)")
			}
		}
	}

	updateRecordingControls := func() {
		if recordingPipeline == nil {
			recordButton.SetLabel("Record")
			recordButton.RemoveCSSClass("destructive-action")
			recordButton.AddCSSClass("suggested-action")
			return
		}

		state := recordingPipeline.GetState()
		if state == media.StatePlaying {
			recordButton.SetLabel("Stop Recording")
			recordButton.RemoveCSSClass("suggested-action")
			recordButton.AddCSSClass("destructive-action")
		} else {
			recordButton.SetLabel("Record")
			recordButton.RemoveCSSClass("destructive-action")
			recordButton.AddCSSClass("suggested-action")
		}
	}

	startButton.ConnectClicked(func() {
		if useEmbeddedPreview && embeddedPipeline != nil {
			videoPreview.Start()
		} else if pipeline != nil {
			pipeline.Start()
		}
		updateControls()
	})

	pauseButton.ConnectClicked(func() {
		if useEmbeddedPreview && embeddedPipeline != nil {
			embeddedPipeline.Pause()
		} else if pipeline != nil {
			pipeline.Pause()
		}
		updateControls()
	})

	stopButton.ConnectClicked(func() {
		if useEmbeddedPreview && embeddedPipeline != nil {
			videoPreview.Stop()
		} else if pipeline != nil {
			pipeline.Stop()
		}
		updateControls()
	})

	recordButton.ConnectClicked(func() {
		if recordingPipeline != nil && recordingPipeline.GetState() == media.StatePlaying {
			recordingPipeline.Stop()
			lastRecordingPath = recordingPipeline.OutputPath()
			recordingLabel.SetText(fmt.Sprintf("Saved: %s", lastRecordingPath))
			recordingPipeline = nil
			updateRecordingControls()
			if transcribeSvc != nil && lastRecordingPath != "" {
				transcribeButton.SetSensitive(true)
			}
			return
		}

		tmpDir := filepath.Join(os.TempDir(), "verbal-recordings")
		timestamp := time.Now().Format("20060102-150405")
		outputPath := filepath.Join(tmpDir, fmt.Sprintf("recording-%s.webm", timestamp))

		var err error
		recordingPipeline, err = media.NewRecordingPipelineWithFallback(outputPath)
		if err != nil {
			statusLabel.SetText(fmt.Sprintf("Recording error: %v", err))
			return
		}

		recordingPipeline.Start()
		if media.HasVideoDevice() {
			recordingLabel.SetText("Recording (hardware)...")
		} else {
			recordingLabel.SetText("Recording (test source)...")
		}
		updateRecordingControls()
	})

	transcribeButton.ConnectClicked(func() {
		if transcribeSvc == nil || lastRecordingPath == "" {
			return
		}

		transcribeButton.SetSensitive(false)
		transcriptionView.Show()
		transcriptionView.SetStatus("Transcribing...")

		go func() {
			transcribeSvc.SetProgressCallback(func(status string) {
				glib.IdleAdd(func() bool {
					transcriptionView.SetStatus(status)
					return false
				})
			})

			result, err := transcribeSvc.TranscribeFile(context.Background(), lastRecordingPath)

			glib.IdleAdd(func() bool {
				if err != nil {
					transcriptionView.SetError(err)
					transcribeButton.SetSensitive(true)
				} else {
					transcriptionView.SetResult(result)
					transcribeButton.SetSensitive(true)
				}
				return false
			})
		}()
	})

	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	buttonBox.SetHAlign(gtk.AlignCenter)
	buttonBox.Append(startButton)
	buttonBox.Append(pauseButton)
	buttonBox.Append(stopButton)
	buttonBox.Append(recordButton)
	buttonBox.Append(transcribeButton)

	contentBox := gtk.NewBox(gtk.OrientationVertical, 12)
	contentBox.SetMarginTop(24)
	contentBox.SetMarginBottom(24)
	contentBox.SetMarginStart(24)
	contentBox.SetMarginEnd(24)
	contentBox.Append(titleLabel)

	if useEmbeddedPreview && videoPreview != nil {
		contentBox.Append(videoPreview.Widget())
	}

	contentBox.Append(buttonBox)
	contentBox.Append(statusLabel)
	contentBox.Append(recordingLabel)
	contentBox.Append(transcriptionView.Widget())

	window.SetChild(contentBox)
	window.Show()

	updateControls()
	updateRecordingControls()
}
