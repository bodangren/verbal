package ui

import (
	"fmt"

	"github.com/diamondburned/gotk4/pkg/glib/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/filler"
)

type FillerRemovalDialog struct {
	dialog *gtk.Dialog

	recordingID    int64
	recordingPath  string
	fillerService  *filler.FillerService
	removalService *filler.FillerRemovalService

	progressBar  *gtk.ProgressBar
	statusLabel  *gtk.Label
	resultBox    *gtk.Box
	resultLabel  *gtk.Label
	removeButton *gtk.Button
	cancelButton *gtk.Button

	progressPercent int
	progressMessage string
	result          *filler.RemovalResult

	onRemove   func()
	onComplete func(outputPath string, removedCount int, updatedTranscriptionJSON string)
	onCancel   func()
}

func NewFillerRemovalDialog(parent *gtk.Window) *FillerRemovalDialog {
	dialog := gtk.NewDialog()
	dialog.SetTitle("Remove Fillers")
	dialog.SetTransientFor(parent)
	dialog.SetModal(true)
	dialog.SetDefaultSize(500, 350)
	dialog.SetResizable(false)

	content := dialog.ContentArea()
	content.SetSpacing(0)

	mainBox := gtk.NewBox(gtk.OrientationVertical, 0)
	mainBox.SetVExpand(true)
	content.Append(mainBox)

	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(18)
	headerBox.SetMarginEnd(18)
	headerBox.SetMarginTop(18)
	headerBox.SetMarginBottom(12)

	titleLabel := gtk.NewLabel("Remove Filler Words")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHAlign(gtk.AlignStart)
	headerBox.Append(titleLabel)

	descLabel := gtk.NewLabel("Remove all detected filler words from the recording. This will create a new video file without the fillers.")
	descLabel.SetHAlign(gtk.AlignStart)
	descLabel.AddCSSClass("dim-label")
	descLabel.SetWrap(true)
	headerBox.Append(descLabel)

	mainBox.Append(headerBox)

	separator := gtk.NewSeparator(gtk.OrientationHorizontal)
	mainBox.Append(separator)

	progressBox := gtk.NewBox(gtk.OrientationVertical, 8)
	progressBox.SetMarginStart(18)
	progressBox.SetMarginEnd(18)
	progressBox.SetMarginTop(12)
	progressBox.SetMarginBottom(12)

	progressBar := gtk.NewProgressBar()
	progressBar.SetShowText(true)
	progressBar.SetText("Ready")
	progressBar.SetFraction(0.0)
	progressBox.Append(progressBar)

	statusLabel := gtk.NewLabel("")
	statusLabel.AddCSSClass("dim-label")
	statusLabel.SetHAlign(gtk.AlignStart)
	statusLabel.SetVisible(false)
	progressBox.Append(statusLabel)

	mainBox.Append(progressBox)

	resultBox := gtk.NewBox(gtk.OrientationVertical, 8)
	resultBox.SetMarginStart(18)
	resultBox.SetMarginEnd(18)
	resultBox.SetMarginBottom(12)
	resultBox.SetVisible(false)

	resultLabel := gtk.NewLabel("")
	resultLabel.SetHAlign(gtk.AlignStart)
	resultBox.Append(resultLabel)

	mainBox.Append(resultBox)

	buttonBox := gtk.NewBox(gtk.OrientationHorizontal, 8)
	buttonBox.SetMarginStart(18)
	buttonBox.SetMarginEnd(18)
	buttonBox.SetMarginBottom(12)
	buttonBox.SetHAlign(gtk.AlignEnd)

	cancelButton := gtk.NewButtonWithLabel("Cancel")
	buttonBox.Append(cancelButton)

	removeButton := gtk.NewButtonWithLabel("Remove All Fillers")
	removeButton.AddCSSClass("destructive-action")
	removeButton.ConnectClicked(func() {
		if d.onRemove != nil {
			d.onRemove()
		}
	})
	buttonBox.Append(removeButton)

	mainBox.Append(buttonBox)

	dialog := &FillerRemovalDialog{
		dialog:       dialog,
		progressBar:  progressBar,
		statusLabel:  statusLabel,
		resultBox:    resultBox,
		resultLabel:  resultLabel,
		removeButton: removeButton,
		cancelButton: cancelButton,
	}

	cancelButton.ConnectClicked(func() {
		if dialog.onCancel != nil {
			dialog.onCancel()
		}
		dialog.Close()
	})

	return dialog
}

func (d *FillerRemovalDialog) onRemove() {
	if d.removalService == nil || d.recordingID == 0 {
		return
	}

	d.SetRemovingState(true)
	d.UpdateProgress(0, "Removing fillers...")

	go func() {
		result, err := d.removalService.RemoveAllFillers(d.recordingID)
		d.result = result

		glib.IdleAdd(func() {
			d.SetRemovingState(false)

			if err != nil {
				d.UpdateProgress(0, "")
				d.ShowError(fmt.Sprintf("Failed to remove fillers: %v", err))
				return
			}

			d.UpdateProgress(100, "Complete")
			d.ShowResult(result.OutputPath, result.RemovedFillers)

			if d.onComplete != nil {
				d.onComplete(result.OutputPath, result.RemovedFillers, result.UpdatedTranscriptionJSON)
			}
		})
	}()
}

func (d *FillerRemovalDialog) ShowError(message string) {
	d.statusLabel.SetText(message)
	d.statusLabel.SetVisible(true)
}

func (d *FillerRemovalDialog) ShowResult(outputPath string, removedCount int) {
	d.resultLabel.SetText(fmt.Sprintf("Removed %d fillers. Output: %s", removedCount, outputPath))
	d.resultBox.SetVisible(true)
	d.removeButton.SetSensitive(false)
	d.cancelButton.SetLabel("Close")
}

func (d *FillerRemovalDialog) UpdateProgress(percent int, message string) {
	fraction := float64(percent) / 100.0
	if fraction < 0 {
		fraction = 0
	}
	if fraction > 1 {
		fraction = 1
	}

	d.progressBar.SetFraction(fraction)
	d.progressBar.SetText(message)

	if message != "" {
		d.statusLabel.SetText(message)
		d.statusLabel.SetVisible(true)
	}
}

func (d *FillerRemovalDialog) SetRemovingState(removing bool) {
	d.removeButton.SetSensitive(!removing)
	d.cancelButton.SetSensitive(!removing || d.result != nil)

	if removing {
		d.cancelButton.SetLabel("Cancel")
	} else {
		d.cancelButton.SetLabel("Close")
	}
}

func (d *FillerRemovalDialog) SetRecording(id int64, path string) {
	d.recordingID = id
	d.recordingPath = path
}

func (d *FillerRemovalDialog) SetFillerService(svc *filler.FillerService) {
	d.fillerService = svc
}

func (d *FillerRemovalDialog) SetRemovalService(svc *filler.FillerRemovalService) {
	d.removalService = svc
}

func (d *FillerRemovalDialog) SetOnRemove(cb func()) {
	d.onRemove = cb
}

func (d *FillerRemovalDialog) SetOnComplete(cb func(outputPath string, removedCount int, updatedTranscriptionJSON string)) {
	d.onComplete = cb
}

func (d *FillerRemovalDialog) SetOnCancel(cb func()) {
	d.onCancel = cb
	d.cancelButton.ConnectClicked(func() {
		if cb != nil {
			cb()
		}
	})
}

func (d *FillerRemovalDialog) Show() {
	d.dialog.Show()
}

func (d *FillerRemovalDialog) Close() {
	d.dialog.Close()
}

func (d *FillerRemovalDialog) GetResult() *filler.RemovalResult {
	return d.result
}
