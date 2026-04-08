package ui

import (
	"time"

	"github.com/diamondburned/gotk4/pkg/cairo"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
	"verbal/internal/waveform"
)

// WaveformWidget displays an audio waveform visualization using Cairo rendering.
// It extends gtk.DrawingArea to provide custom drawing capabilities.
type WaveformWidget struct {
	*gtk.DrawingArea

	// Data
	data     *waveform.Data
	position time.Duration

	// Dimensions
	width  int
	height int

	// Callbacks
	onPositionChange func(time.Duration)
}

// NewWaveformWidget creates a new waveform visualization widget.
// The widget uses Cairo for rendering the waveform amplitude over time.
func NewWaveformWidget() *WaveformWidget {
	drawingArea := gtk.NewDrawingArea()

	ww := &WaveformWidget{
		DrawingArea: drawingArea,
		width:       400,
		height:      100,
	}

	// Set default size
	drawingArea.SetSizeRequest(ww.width, ww.height)
	drawingArea.SetHExpand(true)

	// Connect draw function
	drawingArea.SetDrawFunc(ww.draw)

	// Connect click handler for seek functionality
	drawingArea.AddController(ww.createClickController())

	return ww
}

// SetData sets the waveform data to display.
// This will trigger a redraw of the widget.
func (ww *WaveformWidget) SetData(data *waveform.Data) {
	ww.data = data
	ww.queueDraw()
}

// GetData returns the current waveform data.
func (ww *WaveformWidget) GetData() *waveform.Data {
	return ww.data
}

// ClearData removes the current waveform data.
func (ww *WaveformWidget) ClearData() {
	ww.data = nil
	ww.queueDraw()
}

// SetPosition updates the current playback position.
// The position indicator will be redrawn at the new location.
// This method accepts time.Duration for internal use.
func (ww *WaveformWidget) SetPosition(position time.Duration) {
	ww.position = position
	ww.queueDraw()
}

// GetPosition returns the current playback position.
func (ww *WaveformWidget) GetPosition() time.Duration {
	return ww.position
}

// UpdatePosition updates the waveform position indicator from seconds.
// This implements the sync.WaveformUpdater interface.
func (ww *WaveformWidget) UpdatePosition(seconds float64) {
	ww.SetPosition(time.Duration(seconds * float64(time.Second)))
}

// SetPositionCallback sets the callback for when the user clicks on the waveform.
// The callback receives the time position corresponding to the click location.
func (ww *WaveformWidget) SetPositionCallback(callback func(time.Duration)) {
	ww.onPositionChange = callback
}

// draw is the Cairo draw function for the widget.
// It renders the waveform and position indicator.
func (ww *WaveformWidget) draw(da *gtk.DrawingArea, cr *cairo.Context, width, height int) {
	ww.width = width
	ww.height = height

	// Clear background
	cr.SetSourceRGB(0.12, 0.12, 0.12) // Dark background
	cr.Rectangle(0, 0, float64(width), float64(height))
	cr.Fill()

	// Draw waveform if data is available
	if ww.data != nil && len(ww.data.Samples) > 0 {
		ww.drawWaveform(cr, width, height)
	}

	// Draw position indicator
	if ww.data != nil && ww.data.Duration > 0 {
		ww.drawPositionIndicator(cr, width, height)
	}
}

// drawWaveform renders the waveform samples as vertical bars.
func (ww *WaveformWidget) drawWaveform(cr *cairo.Context, width, height int) {
	if len(ww.data.Samples) == 0 {
		return
	}

	// Calculate bar width based on widget width and sample count
	barWidth := float64(width) / float64(len(ww.data.Samples))
	if barWidth < 1 {
		barWidth = 1
	}

	centerY := float64(height) / 2

	// Set waveform color (subtle gray/white gradient effect)
	cr.SetSourceRGB(0.6, 0.6, 0.6)

	for i, sample := range ww.data.Samples {
		x := float64(i) * barWidth
		amplitude := sample.Amplitude

		// Calculate bar height based on amplitude
		barHeight := amplitude * float64(height) * 0.9 // 90% max height

		// Draw bar centered vertically
		cr.Rectangle(x, centerY-barHeight/2, barWidth-0.5, barHeight)
		cr.Fill()
	}
}

// drawPositionIndicator draws a vertical line at the current playback position.
func (ww *WaveformWidget) drawPositionIndicator(cr *cairo.Context, width, height int) {
	if ww.data.Duration == 0 {
		return
	}

	// Calculate x position based on current position and duration
	progress := float64(ww.position) / float64(ww.data.Duration)
	x := progress * float64(width)

	// Draw position line (GNOME blue accent)
	cr.SetSourceRGB(0.21, 0.52, 0.89) // #3584E4
	cr.SetLineWidth(2)
	cr.MoveTo(x, 0)
	cr.LineTo(x, float64(height))
	cr.Stroke()
}

// createClickController creates a gesture controller for click handling.
func (ww *WaveformWidget) createClickController() *gtk.GestureClick {
	controller := gtk.NewGestureClick()
	controller.SetButton(1) // Left mouse button

	controller.ConnectPressed(func(nPress int, x, y float64) {
		if ww.data == nil || ww.data.Duration == 0 {
			return
		}

		// Calculate time position from click x coordinate
		progress := x / float64(ww.width)
		if progress < 0 {
			progress = 0
		}
		if progress > 1 {
			progress = 1
		}

		position := time.Duration(progress * float64(ww.data.Duration))

		// Call callback if set
		if ww.onPositionChange != nil {
			ww.onPositionChange(position)
		}
	})

	return controller
}

// queueDraw triggers a redraw of the widget.
func (ww *WaveformWidget) queueDraw() {
	if ww.DrawingArea != nil {
		ww.DrawingArea.QueueDraw()
	}
}

// simulateClickAt simulates a click at a relative position (0.0 to 1.0).
// This is used for testing the click-to-seek functionality.
func (ww *WaveformWidget) simulateClickAt(relativeX float64) {
	if ww.onPositionChange != nil && ww.data != nil && ww.data.Duration > 0 {
		position := time.Duration(relativeX * float64(ww.data.Duration))
		ww.onPositionChange(position)
	}
}
