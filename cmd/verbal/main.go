package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"verbal/internal/ai"
	"verbal/internal/media"
	"verbal/internal/transcription"
	"verbal/internal/ui"

	"github.com/diamondburned/gotk4/pkg/gio/v2"
	"github.com/diamondburned/gotk4/pkg/glib/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

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
	window.SetTitle("Verbal - Unified Media Engine")
	window.SetDefaultSize(800, 600)

	outputPath := filepath.Join(os.TempDir(), "verbal-unified.mkv")
	pipeline, err := media.NewUnifiedPipeline(outputPath, media.HasVideoDevice())
	if err != nil {
		fmt.Printf("Failed to create unified pipeline: %v\n", err)
	}

	label := gtk.NewLabel("Welcome to Verbal (GTK4 + Go)")
	label.AddCSSClass("title-label")
	label.SetMarginTop(20)
	label.SetMarginBottom(10)

	statusLabel := gtk.NewLabel("Ready")
	statusLabel.AddCSSClass("status-label")
	statusLabel.SetMarginBottom(20)

	transcriptionView := ui.NewTranscriptionView()

	startButton := gtk.NewButtonWithLabel("Start Preview")
	startButton.AddCSSClass("action-button")
	startButton.ConnectClicked(func() {
		if pipeline != nil {
			fmt.Println("Starting pipeline...")
			pipeline.Start()
			updateStatus(statusLabel, pipeline)
		}
	})

	stopButton := gtk.NewButtonWithLabel("Stop Preview")
	stopButton.AddCSSClass("action-button")
	stopButton.ConnectClicked(func() {
		if pipeline != nil {
			fmt.Println("Stopping pipeline...")
			pipeline.Stop()
			updateStatus(statusLabel, pipeline)
		}
	})

	recordButton := gtk.NewButtonWithLabel("Toggle Recording")
	recordButton.AddCSSClass("action-button")
	recordButton.ConnectClicked(func() {
		if pipeline == nil {
			return
		}

		if pipeline.IsRecording() {
			fmt.Println("Stopping recording...")
			pipeline.StopRecording()
		} else {
			fmt.Println("Starting recording...")
			pipeline.StartRecording()
		}
		updateStatus(statusLabel, pipeline)
	})

	transcribeButton := gtk.NewButtonWithLabel("Transcribe")
	transcribeButton.AddCSSClass("action-button")
	transcribeButton.ConnectClicked(func() {
		if pipeline == nil {
			return
		}
		recPath := pipeline.OutputPath()

		provider, err := ai.NewProviderFromEnv()
		if err != nil {
			transcriptionView.SetError(err)
			return
		}

		svc := transcription.NewService(provider)
		svc.SetProgressCallback(func(msg string) {
			glib.IdleAdd(func() bool {
				transcriptionView.SetStatus(msg)
				return false
			})
		})

		transcriptionView.Show()
		transcriptionView.SetStatus("Preparing transcription...")

		go func() {
			meta := transcription.NewRecordingMetadata(recPath)
			result, err := svc.TranscribeFile(context.Background(), recPath)
			if err != nil {
				meta.SetTranscribeError(err)
				_ = meta.Save()
				glib.IdleAdd(func() bool {
					transcriptionView.SetError(err)
					return false
				})
				return
			}
			meta.SetTranscription(result)
			_ = meta.Save()
			glib.IdleAdd(func() bool {
				transcriptionView.SetResult(result)
				return false
			})
		}()
	})

	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	buttonBox.SetHAlign(gtk.AlignCenter)
	buttonBox.Append(startButton)
	buttonBox.Append(stopButton)
	buttonBox.Append(recordButton)
	buttonBox.Append(transcribeButton)

	box := gtk.NewBox(gtk.OrientationVertical, 10)
	box.SetMarginStart(20)
	box.SetMarginEnd(20)
	box.Append(label)
	box.Append(statusLabel)
	box.Append(buttonBox)
	box.Append(transcriptionView.Widget())

	window.SetChild(box)
	window.Show()

	updateStatus(statusLabel, pipeline)
}

func updateStatus(label *gtk.Label, p *media.Pipeline) {
	status := "Status: "
	if p != nil {
		if p.IsRecording() {
			status += "RECORDING + "
		}

		switch p.GetState() {
		case media.StatePlaying:
			status += "Preview Running"
		case media.StatePaused:
			status += "Preview Paused"
		case media.StateStopped:
			status += "Ready"
		}

		if p.UsesHardware() {
			status += " (Hardware Active)"
		} else {
			status += " (Test Source)"
		}
	} else {
		status += "Error"
	}
	label.SetText(status)
}
