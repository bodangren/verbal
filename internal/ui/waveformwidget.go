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

	// Viewport control
	zoomLevel    float64 // 1.0 = 100%, 2.0 = 200%, 0.5 = 50%
	minZoom      float64
	maxZoom      float64
	scrollOffset float64 // 0.0 to 1.0, percentage of total scrollable area

	// Selection
	selectStart       time.Duration
	selectEnd         time.Duration
	isSelecting       bool
	onSelectionChange func(start, end time.Duration)

	// Callbacks
	onPositionChange func(time.Duration)
	scrollController *gtk.EventControllerScroll
}

// NewWaveformWidget creates a new waveform visualization widget.
// The widget uses Cairo for rendering the waveform amplitude over time.
func NewWaveformWidget() *WaveformWidget {
	drawingArea := gtk.NewDrawingArea()

	ww := &WaveformWidget{
		DrawingArea:  drawingArea,
		width:        400,
		height:       100,
		zoomLevel:    1.0,
		minZoom:      0.1,
		maxZoom:      10.0,
		scrollOffset: 0.0,
	}

	// Set default size
	drawingArea.SetSizeRequest(ww.width, ww.height)
	drawingArea.SetHExpand(true)

	// Connect draw function
	drawingArea.SetDrawFunc(ww.draw)

	// Connect click handler for seek functionality
	drawingArea.AddController(ww.createClickController())

	// Connect scroll handler for zoom/pan
	ww.scrollController = ww.createScrollController()
	drawingArea.AddController(ww.scrollController)

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

	visibleStart, visibleEnd := ww.getVisibleTimeRange(float64(width))
	if visibleStart >= visibleEnd {
		return
	}

	// Calculate which samples are visible
	totalSamples := len(ww.data.Samples)
	totalDuration := ww.data.Duration

	startSample := int(float64(visibleStart) / float64(totalDuration) * float64(totalSamples))
	endSample := int(float64(visibleEnd) / float64(totalDuration) * float64(totalSamples))

	if startSample < 0 {
		startSample = 0
	}
	if endSample > totalSamples {
		endSample = totalSamples
	}

	// Calculate bar width based on visible samples
	visibleSamples := endSample - startSample
	if visibleSamples == 0 {
		return
	}

	barWidth := float64(width) / float64(visibleSamples)
	if barWidth < 1 {
		barWidth = 1
	}

	centerY := float64(height) / 2

	// Draw selection background if there is a selection
	if ww.HasSelection() {
		ww.drawSelection(cr, width, height)
	}

	// Set waveform color (subtle gray/white gradient effect)
	cr.SetSourceRGB(0.6, 0.6, 0.6)

	for i := startSample; i < endSample; i++ {
		x := float64(i-startSample) * barWidth
		sample := ww.data.Samples[i]
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

	// Calculate x position using timeToX to account for scroll/zoom
	x := ww.timeToX(ww.position, float64(width))

	// Clamp to visible area
	if x < 0 || x > float64(width) {
		return
	}

	// Draw position line (GNOME blue accent)
	cr.SetSourceRGB(0.21, 0.52, 0.89) // #3584E4
	cr.SetLineWidth(2)
	cr.MoveTo(x, 0)
	cr.LineTo(x, float64(height))
	cr.Stroke()
}

// drawSelection draws the selected time range highlight.
func (ww *WaveformWidget) drawSelection(cr *cairo.Context, width, height int) {
	if !ww.HasSelection() {
		return
	}

	// Calculate x coordinates for selection
	x1 := ww.timeToX(ww.selectStart, float64(width))
	x2 := ww.timeToX(ww.selectEnd, float64(width))

	// Only draw if selection is visible
	if x2 < 0 || x1 > float64(width) {
		return
	}

	// Clamp to visible area
	if x1 < 0 {
		x1 = 0
	}
	if x2 > float64(width) {
		x2 = float64(width)
	}

	// Draw semi-transparent selection highlight
	cr.SetSourceRGBA(0.21, 0.52, 0.89, 0.3) // GNOME blue with 30% opacity
	cr.Rectangle(x1, 0, x2-x1, float64(height))
	cr.Fill()

	// Draw selection borders
	cr.SetSourceRGB(0.21, 0.52, 0.89) // #3584E4
	cr.SetLineWidth(1)
	cr.MoveTo(x1, 0)
	cr.LineTo(x1, float64(height))
	cr.Stroke()
	cr.MoveTo(x2, 0)
	cr.LineTo(x2, float64(height))
	cr.Stroke()
}

// createClickController creates a gesture controller for click handling.
func (ww *WaveformWidget) createClickController() *gtk.GestureClick {
	controller := gtk.NewGestureClick()
	controller.SetButton(1) // Left mouse button

	var dragStartX float64
	var isDragging bool

	controller.ConnectPressed(func(nPress int, x, y float64) {
		if ww.data == nil || ww.data.Duration == 0 {
			return
		}

		// Single click = seek, double click = no-op, drag = select
		if nPress == 1 {
			dragStartX = x
			isDragging = false
		}
	})

	controller.ConnectReleased(func(nPress int, x, y float64) {
		if ww.data == nil || ww.data.Duration == 0 {
			return
		}

		if !isDragging {
			// This was a click, not a drag - seek to position
			position := ww.xToTime(x, float64(ww.width))
			if ww.onPositionChange != nil {
				ww.onPositionChange(position)
			}
		}
		isDragging = false
	})

	// Add drag handling for selection
	dragController := gtk.NewGestureDrag()
	dragController.SetButton(1)

	dragController.ConnectDragBegin(func(startX, startY float64) {
		if ww.data == nil || ww.data.Duration == 0 {
			return
		}
		dragStartX = startX
		isDragging = false
	})

	dragController.ConnectDragUpdate(func(offsetX, offsetY float64) {
		if ww.data == nil {
			return
		}
		// Consider it a drag if moved more than 5 pixels
		if abs(offsetX) > 5 {
			isDragging = true
		}
	})

	dragController.ConnectDragEnd(func(offsetX, offsetY float64) {
		if ww.data == nil || !isDragging {
			return
		}

		// Create selection from drag
		x1 := dragStartX
		x2 := dragStartX + offsetX
		if x1 > x2 {
			x1, x2 = x2, x1
		}

		start := ww.xToTime(x1, float64(ww.width))
		end := ww.xToTime(x2, float64(ww.width))
		ww.SetSelection(start, end)
	})

	// Add drag controller to widget
	ww.AddController(dragController)

	return controller
}

// abs returns the absolute value of a float64.
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
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

// Zoom control methods

// SetZoomLevel sets the zoom level (1.0 = 100%, 2.0 = 200%, etc.)
// Values are clamped to [minZoom, maxZoom] range.
func (ww *WaveformWidget) SetZoomLevel(zoom float64) {
	if zoom < ww.minZoom {
		zoom = ww.minZoom
	}
	if zoom > ww.maxZoom {
		zoom = ww.maxZoom
	}
	ww.zoomLevel = zoom
	ww.queueDraw()
}

// GetZoomLevel returns the current zoom level.
func (ww *WaveformWidget) GetZoomLevel() float64 {
	return ww.zoomLevel
}

// ZoomIn increases zoom level by the given factor (default 1.2).
func (ww *WaveformWidget) ZoomIn(factor ...float64) {
	f := 1.2
	if len(factor) > 0 {
		f = factor[0]
	}
	ww.SetZoomLevel(ww.zoomLevel * f)
}

// ZoomOut decreases zoom level by the given factor (default 1.2).
func (ww *WaveformWidget) ZoomOut(factor ...float64) {
	f := 1.2
	if len(factor) > 0 {
		f = factor[0]
	}
	ww.SetZoomLevel(ww.zoomLevel / f)
}

// ResetZoom resets zoom to 1.0 (100%).
func (ww *WaveformWidget) ResetZoom() {
	ww.SetZoomLevel(1.0)
	ww.scrollOffset = 0.0
}

// Scroll methods

// SetScrollOffset sets the horizontal scroll offset (0.0 to 1.0).
func (ww *WaveformWidget) SetScrollOffset(offset float64) {
	if offset < 0 {
		offset = 0
	}
	if offset > 1 {
		offset = 1
	}
	ww.scrollOffset = offset
	ww.queueDraw()
}

// GetScrollOffset returns the current scroll offset.
func (ww *WaveformWidget) GetScrollOffset() float64 {
	return ww.scrollOffset
}

// ScrollToPosition scrolls to show the given time position.
func (ww *WaveformWidget) ScrollToPosition(position time.Duration) {
	if ww.data == nil || ww.data.Duration == 0 {
		return
	}
	// Calculate what scroll offset would center this position
	progress := float64(position) / float64(ww.data.Duration)
	// Center the position in the view
	visibleRange := 1.0 / ww.zoomLevel
	scrollOffset := progress - visibleRange/2
	ww.SetScrollOffset(scrollOffset)
}

// Coordinate conversion methods

// timeToX converts a time position to an x coordinate in the widget.
func (ww *WaveformWidget) timeToX(t time.Duration, viewWidth float64) float64 {
	if ww.data == nil || ww.data.Duration == 0 {
		return 0
	}

	// Calculate total time range visible at current zoom
	totalDuration := float64(ww.data.Duration)
	visibleDuration := totalDuration / ww.zoomLevel

	// Calculate the start time of the visible range based on scroll
	scrollOffsetDuration := ww.scrollOffset * (totalDuration - visibleDuration)
	if scrollOffsetDuration < 0 {
		scrollOffsetDuration = 0
	}

	// Calculate position within visible range
	relativePos := (float64(t) - scrollOffsetDuration) / visibleDuration
	x := relativePos * viewWidth

	return x
}

// xToTime converts an x coordinate to a time position.
func (ww *WaveformWidget) xToTime(x float64, viewWidth float64) time.Duration {
	if ww.data == nil || ww.data.Duration == 0 || viewWidth <= 0 {
		return 0
	}

	// Calculate total time range visible at current zoom
	totalDuration := float64(ww.data.Duration)
	visibleDuration := totalDuration / ww.zoomLevel

	// Calculate the start time of the visible range based on scroll
	scrollOffsetDuration := ww.scrollOffset * (totalDuration - visibleDuration)
	if scrollOffsetDuration < 0 {
		scrollOffsetDuration = 0
	}

	// Convert x to progress within visible range
	progress := x / viewWidth
	t := scrollOffsetDuration + progress*visibleDuration

	return time.Duration(t)
}

// getVisibleTimeRange returns the start and end times of the visible range.
func (ww *WaveformWidget) getVisibleTimeRange(viewWidth float64) (start, end time.Duration) {
	if ww.data == nil || ww.data.Duration == 0 {
		return 0, 0
	}

	totalDuration := float64(ww.data.Duration)
	visibleDuration := totalDuration / ww.zoomLevel

	// Calculate the start time based on scroll offset
	scrollOffsetDuration := ww.scrollOffset * (totalDuration - visibleDuration)
	if scrollOffsetDuration < 0 {
		scrollOffsetDuration = 0
	}
	if scrollOffsetDuration+visibleDuration > totalDuration {
		scrollOffsetDuration = totalDuration - visibleDuration
	}

	start = time.Duration(scrollOffsetDuration)
	end = time.Duration(scrollOffsetDuration + visibleDuration)

	// Clamp to duration bounds
	if end > ww.data.Duration {
		end = ww.data.Duration
	}

	return start, end
}

// Selection methods

// SetSelection sets the selected time range.
func (ww *WaveformWidget) SetSelection(start, end time.Duration) {
	if start < 0 {
		start = 0
	}
	if ww.data != nil && end > ww.data.Duration {
		end = ww.data.Duration
	}
	if start > end {
		start, end = end, start
	}
	ww.selectStart = start
	ww.selectEnd = end
	ww.queueDraw()

	if ww.onSelectionChange != nil {
		ww.onSelectionChange(start, end)
	}
}

// GetSelection returns the current selection (start, end).
// If no selection, returns (0, 0).
func (ww *WaveformWidget) GetSelection() (start, end time.Duration) {
	return ww.selectStart, ww.selectEnd
}

// ClearSelection clears the current selection.
func (ww *WaveformWidget) ClearSelection() {
	ww.selectStart = 0
	ww.selectEnd = 0
	ww.isSelecting = false
	ww.queueDraw()
}

// HasSelection returns true if there is an active selection.
func (ww *WaveformWidget) HasSelection() bool {
	return ww.selectStart != ww.selectEnd
}

// SetSelectionCallback sets the callback for selection changes.
func (ww *WaveformWidget) SetSelectionCallback(callback func(start, end time.Duration)) {
	ww.onSelectionChange = callback
}

// createScrollController creates a scroll controller for zoom/pan.
func (ww *WaveformWidget) createScrollController() *gtk.EventControllerScroll {
	controller := gtk.NewEventControllerScroll(
		gtk.EventControllerScrollBothAxes,
	)

	controller.ConnectScroll(func(dx, dy float64) bool {
		if ww.data == nil {
			return false
		}

		// Ctrl+scroll = zoom
		// Shift+scroll = horizontal pan
		// Regular scroll = vertical (pass through)

		// Check for Ctrl modifier for zoom
		// Note: Modifier detection would need event state access
		// For now, use shift+scroll for horizontal, regular scroll for zoom

		if dy > 0 {
			// Scroll down = zoom out or scroll right
			if dx != 0 {
				// Horizontal scroll
				ww.SetScrollOffset(ww.scrollOffset + 0.05)
			} else {
				// Zoom out
				ww.ZoomOut()
			}
		} else if dy < 0 {
			// Scroll up = zoom in or scroll left
			if dx != 0 {
				// Horizontal scroll
				ww.SetScrollOffset(ww.scrollOffset - 0.05)
			} else {
				// Zoom in
				ww.ZoomIn()
			}
		}

		return true
	})

	return controller
}
