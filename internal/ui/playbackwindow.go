package ui

import (
	"fmt"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// PlaybackWindow provides a split-pane layout for video playback with
// synchronized transcription display. It includes playback controls and
// a seek slider for navigating through the video.
//
// The layout consists of:
//   - Left pane (60%): Video widget
//   - Right pane (40%): Transcription view (scrollable)
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

	// Transcription pane (right side)
	transcriptionWidget   *gtk.Widget
	editableTranscription *EditableTranscriptionView

	// Playback controls
	playButton  *gtk.Button
	pauseButton *gtk.Button
	stopButton  *gtk.Button
	seekSlider  *gtk.Scale
	timeLabel   *gtk.Label

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

	// Error label (hidden by default)
	errorLabel := gtk.NewLabel("")
	errorLabel.AddCSSClass("error-label")
	errorLabel.SetVisible(false)

	pw := &PlaybackWindow{
		root:       root,
		paned:      paned,
		errorLabel: errorLabel,
	}

	// Create toolbar with playback controls (stores refs in pw)
	toolbar := createPlaybackToolbarWithRefs(pw)
	pw.toolbar = toolbar

	// Assemble layout
	root.Append(paned)
	root.Append(errorLabel)
	root.Append(toolbar)

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
func (pw *PlaybackWindow) SetTranscriptionWidget(widget *gtk.Widget) {
	pw.transcriptionWidget = widget
	pw.paned.SetEndChild(widget)
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
	currentStr := formatDuration(current)
	totalStr := formatDuration(total)
	pw.timeLabel.SetText(fmt.Sprintf("%s / %s", currentStr, totalStr))
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

// formatDuration formats seconds as MM:SS.
func formatDuration(seconds float64) string {
	mins := int(seconds) / 60
	secs := int(seconds) % 60
	return fmt.Sprintf("%d:%02d", mins, secs)
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
