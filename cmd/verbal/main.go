package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"verbal/internal/media"
	"verbal/internal/ui"

	"github.com/diamondburned/gotk4/pkg/gio/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

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

	pipeline, err := media.NewPreviewPipelineWithFallback()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create pipeline: %v\n", err)
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

	recordingLabel := gtk.NewLabel("")
	recordingLabel.AddCSSClass("dim-label")

	updateControls := func() {
		if pipeline == nil {
			startButton.SetSensitive(false)
			pauseButton.SetSensitive(false)
			stopButton.SetSensitive(false)
			statusLabel.SetText("Error: Pipeline not initialized")
			return
		}

		state := pipeline.GetState()
		sourceType := "test source"
		if pipeline.UsesHardware() {
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
		if pipeline != nil {
			pipeline.Start()
			updateControls()
		}
	})

	pauseButton.ConnectClicked(func() {
		if pipeline != nil {
			pipeline.Pause()
			updateControls()
		}
	})

	stopButton.ConnectClicked(func() {
		if pipeline != nil {
			pipeline.Stop()
			updateControls()
		}
	})

	recordButton.ConnectClicked(func() {
		if recordingPipeline != nil && recordingPipeline.GetState() == media.StatePlaying {
			recordingPipeline.Stop()
			recordingLabel.SetText(fmt.Sprintf("Saved: %s", recordingPipeline.OutputPath()))
			recordingPipeline = nil
			updateRecordingControls()
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

	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	buttonBox.SetHAlign(gtk.AlignCenter)
	buttonBox.Append(startButton)
	buttonBox.Append(pauseButton)
	buttonBox.Append(stopButton)
	buttonBox.Append(recordButton)

	contentBox := gtk.NewBox(gtk.OrientationVertical, 12)
	contentBox.SetMarginTop(24)
	contentBox.SetMarginBottom(24)
	contentBox.SetMarginStart(24)
	contentBox.SetMarginEnd(24)
	contentBox.Append(titleLabel)
	contentBox.Append(buttonBox)
	contentBox.Append(statusLabel)
	contentBox.Append(recordingLabel)

	window.SetChild(contentBox)
	window.Show()

	updateControls()
	updateRecordingControls()
}
