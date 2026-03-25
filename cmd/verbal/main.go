package main

import (
	"fmt"
	"os"

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

	pipeline, err := media.NewPreviewPipeline()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create pipeline: %v\n", err)
	}

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

	updateControls := func() {
		if pipeline == nil {
			startButton.SetSensitive(false)
			pauseButton.SetSensitive(false)
			stopButton.SetSensitive(false)
			statusLabel.SetText("Error: Pipeline not initialized")
			return
		}

		state := pipeline.GetState()
		switch state {
		case media.StatePlaying:
			startButton.SetSensitive(false)
			pauseButton.SetSensitive(true)
			stopButton.SetSensitive(true)
			statusLabel.SetText("Preview running...")
		case media.StatePaused:
			startButton.SetSensitive(true)
			pauseButton.SetSensitive(false)
			stopButton.SetSensitive(true)
			statusLabel.SetText("Preview paused")
		case media.StateStopped:
			startButton.SetSensitive(true)
			pauseButton.SetSensitive(false)
			stopButton.SetSensitive(false)
			statusLabel.SetText("Ready")
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

	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	buttonBox.SetHAlign(gtk.AlignCenter)
	buttonBox.Append(startButton)
	buttonBox.Append(pauseButton)
	buttonBox.Append(stopButton)

	contentBox := gtk.NewBox(gtk.OrientationVertical, 12)
	contentBox.SetMarginTop(24)
	contentBox.SetMarginBottom(24)
	contentBox.SetMarginStart(24)
	contentBox.SetMarginEnd(24)
	contentBox.Append(titleLabel)
	contentBox.Append(buttonBox)
	contentBox.Append(statusLabel)

	window.SetChild(contentBox)
	window.Show()

	updateControls()
}
