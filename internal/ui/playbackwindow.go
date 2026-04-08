package ui

import (
	"fmt"
	"time"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// PlaybackWindow provides a split-pane layout for video playback with
// synchronized transcription display. It includes playback controls and
// a seek slider for navigating through the video.
//
// The layout consists of:
//   - Left pane (60%): Video widget
//   - Right pane (40%): Waveform (top) + Transcription view (bottom)
//   - Bottom toolbar: Play/Pause/Stop buttons, seek slider, time display
//
// Thread safety: All UI updates must be made from the GTK main thread.
// Use glib.IdleAdd() for updates from other goroutines.
type PlaybackWindow struct {
	root    *gtk.Box
	paned   *gtk.Paned
	toolbar *gtk.Box

	// Video pane (left side)
	videoWidget *gtk.Widget

	// Right pane container
	rightPane *gtk.Box

	// Waveform widget (top of right pane)
	waveformWidget *WaveformWidget

	// Transcription pane (bottom of right pane)
	transcriptionWidget   *gtk.Widget
	editableTranscription *EditableTranscriptionView

	// Playback controls
	playButton  *gtk.Button
	pauseButton *gtk.Button
	stopButton  *gtk.Button
	seekSlider  *gtk.Scale
	timeLabel   *gtk.Label

	// Loading state
	loadingLabel *gtk.Label

	// Error display
	errorLabel *gtk.Label

	// Callbacks
	onPlay           func()
	onPause          func()
	onStop           func()
	onSeek           func(position float64)
	onExportSegments func(segments []Segment)
}

// NewPlaybackWindow creates a new playback window with split-pane layout.
// The window is initially empty; use SetVideoWidget() and SetTranscriptionWidget()
// to populate the panes.
//
// The default pane position is set to 60% of the window width for the video pane.
func NewPlaybackWindow() *PlaybackWindow {
	// Main vertical box container
	root := gtk.NewBox(gtk.OrientationVertical, 0)

	// Create paned widget for split layout
	paned := gtk.NewPaned(gtk.OrientationHorizontal)
	paned.SetVExpand(true)

	// Set default position (60% of typical window width)
	// This will be adjusted when the window is realized
	paned.SetPosition(480) // 60% of 800px default width

	// Create right pane container (vertical box for waveform + transcription)
	rightPane := gtk.NewBox(gtk.OrientationVertical, 0)
	rightPane.SetVExpand(true)

	// Loading label (hidden by default, shown during waveform generation)
	loadingLabel := gtk.NewLabel("Generating waveform...")
	loadingLabel.AddCSSClass("loading-label")
	loadingLabel.SetVisible(false)
	loadingLabel.SetMarginTop(8)
	loadingLabel.SetMarginBottom(8)

	// Add loading label to right pane
	rightPane.Append(loadingLabel)

	// Error label (hidden by default)
	errorLabel := gtk.NewLabel("")
	errorLabel.AddCSSClass("error-label")
	errorLabel.SetVisible(false)

	pw := &PlaybackWindow{
		root:         root,
		paned:        paned,
		rightPane:    rightPane,
		loadingLabel: loadingLabel,
		errorLabel:   errorLabel,
	}

	// Create toolbar with playback controls (stores refs in pw)
	toolbar := createPlaybackToolbarWithRefs(pw)
	pw.toolbar = toolbar

	// Assemble layout
	root.Append(paned)
	root.Append(errorLabel)
	root.Append(toolbar)

	// Set the right pane as the end child of the paned widget
	paned.SetEndChild(rightPane)

	return pw
}

// createPlaybackToolbarWithRefs creates the toolbar and returns references to controls.
func createPlaybackToolbarWithRefs(pw *PlaybackWindow) *gtk.Box {
	toolbar := gtk.NewBox(gtk.OrientationHorizontal, 8)
	toolbar.AddCSSClass("playback-toolbar")
	toolbar.SetMarginStart(12)
	toolbar.SetMarginEnd(12)
	toolbar.SetMarginTop(8)
	toolbar.SetMarginBottom(8)

	// Play button
	playButton := gtk.NewButtonFromIconName("media-playback-start-symbolic")
	playButton.AddCSSClass("playback-button")
	playButton.SetTooltipText("Play")
	playButton.ConnectClicked(func() {
		if pw.onPlay != nil {
			pw.onPlay()
		}
	})

	// Pause button
	pauseButton := gtk.NewButtonFromIconName("media-playback-pause-symbolic")
	pauseButton.AddCSSClass("playback-button")
	pauseButton.SetTooltipText("Pause")
	pauseButton.ConnectClicked(func() {
		if pw.onPause != nil {
			pw.onPause()
		}
	})

	// Stop button
	stopButton := gtk.NewButtonFromIconName("media-playback-stop-symbolic")
	stopButton.AddCSSClass("playback-button")
	stopButton.SetTooltipText("Stop")
	stopButton.ConnectClicked(func() {
		if pw.onStop != nil {
			pw.onStop()
		}
	})

	// Seek slider
	seekSlider := gtk.NewScaleWithRange(gtk.OrientationHorizontal, 0, 100, 1)
	seekSlider.SetDrawValue(false)
	seekSlider.SetHExpand(true)
	seekSlider.AddCSSClass("seek-slider")
	seekSlider.ConnectValueChanged(func() {
		if pw.onSeek != nil {
			value := seekSlider.Value()
			pw.onSeek(value)
		}
	})

	// Time label
	timeLabel := gtk.NewLabel("0:00 / 0:00")
	timeLabel.AddCSSClass("time-label")
	timeLabel.SetWidthChars(12)

	// Store references
	pw.playButton = playButton
	pw.pauseButton = pauseButton
	pw.stopButton = stopButton
	pw.seekSlider = seekSlider
	pw.timeLabel = timeLabel

	// Add controls to toolbar
	toolbar.Append(playButton)
	toolbar.Append(pauseButton)
	toolbar.Append(stopButton)
	toolbar.Append(seekSlider)
	toolbar.Append(timeLabel)

	return toolbar
}

// Widget returns the root GTK widget for adding to a window.
func (pw *PlaybackWindow) Widget() *gtk.Box {
	return pw.root
}

// GetPaned returns the underlying gtk.Paned widget.
func (pw *PlaybackWindow) GetPaned() *gtk.Paned {
	return pw.paned
}

// SetVideoWidget sets the video widget for the left pane.
func (pw *PlaybackWindow) SetVideoWidget(widget *gtk.Widget) {
	pw.videoWidget = widget
	pw.paned.SetStartChild(widget)
}

// GetVideoWidget returns the current video widget.
func (pw *PlaybackWindow) GetVideoWidget() *gtk.Widget {
	return pw.videoWidget
}

// SetTranscriptionWidget sets the transcription widget for the right pane.
// The transcription widget is added below the waveform widget.
func (pw *PlaybackWindow) SetTranscriptionWidget(widget *gtk.Widget) {
	// Remove existing transcription widget if present
	if pw.transcriptionWidget != nil {
		pw.rightPane.Remove(pw.transcriptionWidget)
	}

	pw.transcriptionWidget = widget
	widget.SetVExpand(true)
	pw.rightPane.Append(widget)
}

// GetTranscriptionWidget returns the current transcription widget.
func (pw *PlaybackWindow) GetTranscriptionWidget() *gtk.Widget {
	return pw.transcriptionWidget
}

// SetPanePosition sets the position of the pane divider in pixels.
func (pw *PlaybackWindow) SetPanePosition(position int) {
	pw.paned.SetPosition(position)
}

// GetPanePosition returns the current position of the pane divider in pixels.
func (pw *PlaybackWindow) GetPanePosition() int {
	return pw.paned.Position()
}

// SetPlayCallback sets the callback for the play button.
func (pw *PlaybackWindow) SetPlayCallback(callback func()) {
	pw.onPlay = callback
}

// SetPauseCallback sets the callback for the pause button.
func (pw *PlaybackWindow) SetPauseCallback(callback func()) {
	pw.onPause = callback
}

// SetStopCallback sets the callback for the stop button.
func (pw *PlaybackWindow) SetStopCallback(callback func()) {
	pw.onStop = callback
}

// SetSeekCallback sets the callback for the seek slider.
// The callback receives the seek position as a percentage (0-100).
func (pw *PlaybackWindow) SetSeekCallback(callback func(position float64)) {
	pw.onSeek = callback
}

// UpdateTimeDisplay updates the time label with current and total time.
// Times are formatted as MM:SS.
func (pw *PlaybackWindow) UpdateTimeDisplay(current, total float64) {
	currentStr := formatDurationSeconds(current)
	totalStr := formatDurationSeconds(total)
	pw.timeLabel.SetText(fmt.Sprintf("%s / %s", currentStr, totalStr))
}

// formatDurationSeconds formats seconds as MM:SS.
func formatDurationSeconds(seconds float64) string {
	mins := int(seconds) / 60
	secs := int(seconds) % 60
	return fmt.Sprintf("%d:%02d", mins, secs)
}

// UpdateSeekSlider updates the seek slider position.
// Position is calculated as a percentage of the total duration.
func (pw *PlaybackWindow) UpdateSeekSlider(current, total float64) {
	if total > 0 {
		percentage := (current / total) * 100.0
		pw.seekSlider.SetValue(percentage)
	} else {
		pw.seekSlider.SetValue(0)
	}
}

// ShowError displays an error message to the user.
// The error label becomes visible with the given message.
func (pw *PlaybackWindow) ShowError(message string) {
	pw.errorLabel.SetText(message)
	pw.errorLabel.SetVisible(true)
}

// ClearError hides the error message.
func (pw *PlaybackWindow) ClearError() {
	pw.errorLabel.SetVisible(false)
}

// SetEditableTranscription sets the editable transcription view for the right pane
// and wires up the export callback.
func (pw *PlaybackWindow) SetEditableTranscription(view *EditableTranscriptionView) {
	pw.editableTranscription = view
	pw.SetTranscriptionWidget(&view.Widget().Widget)

	view.SetExportRequestedHandler(func(segments []Segment) {
		if pw.onExportSegments != nil {
			pw.onExportSegments(segments)
		}
	})
}

// GetEditableTranscription returns the editable transcription view.
func (pw *PlaybackWindow) GetEditableTranscription() *EditableTranscriptionView {
	return pw.editableTranscription
}

// SetExportSegmentsCallback sets the callback for when the user requests to export
// selected transcription segments.
func (pw *PlaybackWindow) SetExportSegmentsCallback(callback func(segments []Segment)) {
	pw.onExportSegments = callback
}

// SetWaveformWidget sets the waveform widget for the right pane.
// The waveform widget is added at the top of the right pane, above the transcription.
func (pw *PlaybackWindow) SetWaveformWidget(widget *WaveformWidget) {
	// Remove existing waveform widget if present
	if pw.waveformWidget != nil {
		pw.rightPane.Remove(pw.waveformWidget)
	}

	pw.waveformWidget = widget
	// Insert at the beginning of the right pane (before transcription)
	pw.rightPane.InsertChildAfter(widget, nil)
}

// GetWaveformWidget returns the current waveform widget.
func (pw *PlaybackWindow) GetWaveformWidget() *WaveformWidget {
	return pw.waveformWidget
}

// ShowLoading displays the loading label with the given message.
func (pw *PlaybackWindow) ShowLoading(message string) {
	pw.loadingLabel.SetText(message)
	pw.loadingLabel.SetVisible(true)
}

// HideLoading hides the loading label.
func (pw *PlaybackWindow) HideLoading() {
	pw.loadingLabel.SetVisible(false)
}

// SetWaveformSeekCallback sets the callback for when the user seeks via the waveform.
// The callback receives the seek position as a duration.
func (pw *PlaybackWindow) SetWaveformSeekCallback(callback func(position float64)) {
	if pw.waveformWidget != nil {
		pw.waveformWidget.SetPositionCallback(func(pos time.Duration) {
			if callback != nil && pw.waveformWidget.data != nil && pw.waveformWidget.data.Duration > 0 {
				percentage := float64(pos) / float64(pw.waveformWidget.data.Duration) * 100.0
				callback(percentage)
			}
		})
	}
}

// UpdateWaveformPosition updates the waveform position indicator.
func (pw *PlaybackWindow) UpdateWaveformPosition(position time.Duration) {
	if pw.waveformWidget != nil {
		pw.waveformWidget.SetPosition(position)
	}
}

// GenerateWaveform generates waveform data for the given file path and updates the widget.
// It shows a loading state during generation and hides it when complete.
// The onComplete callback is called with the generated data or error.
func (pw *PlaybackWindow) GenerateWaveform(filePath string, generator interface {
	GenerateAsync(filePath string, onProgress func(float64), onComplete func(*waveform.Data, error)) error
}, onComplete func(*waveform.Data, error)) {
	pw.ShowLoading("Generating waveform...")

	err := generator.GenerateAsync(filePath, func(progress float64) {
		// Update loading message with progress
		if progress < 1.0 {
			pw.ShowLoading(fmt.Sprintf("Generating waveform... %.0f%%", progress*100))
		}
	}, func(data *waveform.Data, err error) {
		pw.HideLoading()

		if err != nil {
			pw.ShowError(fmt.Sprintf("Failed to generate waveform: %v", err))
		} else if data != nil && pw.waveformWidget != nil {
			pw.waveformWidget.SetData(data)
		}

		if onComplete != nil {
			onComplete(data, err)
		}
	})

	if err != nil {
		pw.HideLoading()
		pw.ShowError(fmt.Sprintf("Failed to start waveform generation: %v", err))
		if onComplete != nil {
			onComplete(nil, err)
		}
	}
}
