package ui

import (
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"verbal/internal/db"

	"github.com/diamondburned/gotk4/pkg/gdk/v4"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// RecordingListItem represents a single recording entry in the library view.
// It displays the recording's metadata and provides interaction handlers.
type RecordingListItem struct {
	recording       *db.Recording
	box             *gtk.Box
	thumbnailWidget *ThumbnailWidget
	selected        bool
	mu              sync.RWMutex

	onActivatedCallbacks []func(*db.Recording)
	onDeleteCallbacks    []func(*db.Recording)
	onExportCallbacks    []func(*db.Recording)
}

// NewRecordingListItem creates a new list item for the given recording.
func NewRecordingListItem(recording *db.Recording) *RecordingListItem {
	// Create main container
	box := gtk.NewBox(gtk.OrientationHorizontal, 12)
	box.AddCSSClass("recording-list-item")
	box.SetMarginStart(12)
	box.SetMarginEnd(12)
	box.SetMarginTop(8)
	box.SetMarginBottom(8)

	// Left side: Thumbnail with duration overlay.
	thumbnailWidget := NewThumbnailWidget()
	thumbnailWidget.SetDuration(recording.Duration)
	if recording.ThumbnailData != "" {
		if err := thumbnailWidget.SetThumbnailBase64(recording.ThumbnailData, recording.ThumbnailMIMEType); err != nil {
			thumbnailWidget.ShowPlaceholder()
		}
	} else {
		thumbnailWidget.ShowPlaceholder()
	}
	box.Append(thumbnailWidget.Widget())

	// Center: Info
	infoBox := gtk.NewBox(gtk.OrientationVertical, 4)
	infoBox.SetHExpand(true)

	// Filename
	filename := filepath.Base(recording.FilePath)
	filenameLabel := gtk.NewLabel(filename)
	filenameLabel.AddCSSClass("recording-filename")
	filenameLabel.SetHAlign(gtk.AlignStart)
	filenameLabel.SetTooltipText(recording.FilePath)
	infoBox.Append(filenameLabel)

	// Metadata row
	metaBox := gtk.NewBox(gtk.OrientationHorizontal, 12)

	// Duration
	durationLabel := gtk.NewLabel(formatDuration(recording.Duration))
	durationLabel.AddCSSClass("recording-duration")
	durationLabel.SetHAlign(gtk.AlignStart)
	metaBox.Append(durationLabel)

	// Status badge
	statusLabel := gtk.NewLabel(formatStatus(recording.TranscriptionStatus))
	statusLabel.AddCSSClass("recording-status")
	statusLabel.AddCSSClass("recording-status-" + recording.TranscriptionStatus)
	metaBox.Append(statusLabel)

	// Date
	dateLabel := gtk.NewLabel(formatDate(recording.CreatedAt))
	dateLabel.AddCSSClass("recording-date")
	metaBox.Append(dateLabel)

	infoBox.Append(metaBox)
	box.Append(infoBox)

	item := &RecordingListItem{
		recording:            recording,
		box:                  box,
		thumbnailWidget:      thumbnailWidget,
		onActivatedCallbacks: make([]func(*db.Recording), 0),
		onDeleteCallbacks:    make([]func(*db.Recording), 0),
		onExportCallbacks:    make([]func(*db.Recording), 0),
	}

	// Check if recording is available and apply styling
	if !recording.IsAvailable() {
		box.AddCSSClass("recording-unavailable")
		filenameLabel.SetTooltipText(recording.FilePath + " (File not found)")
	}

	// Right: Delete button
	deleteBtn := gtk.NewButtonFromIconName("user-trash-symbolic")
	deleteBtn.AddCSSClass("recording-delete-btn")
	deleteBtn.SetTooltipText("Remove from library")
	deleteBtn.ConnectClicked(func() {
		item.emitDelete()
	})
	box.Append(deleteBtn)

	// Setup click gesture for activation
	clickGesture := gtk.NewGestureClick()
	clickGesture.SetButton(1) // Left mouse button
	clickGesture.ConnectReleased(func(nPress int, x, y float64) {
		// Don't activate if delete button was clicked
		if nPress == 2 {
			// Double-click activates
			item.emitActivated()
		}
	})
	box.AddController(clickGesture)

	// Setup hover effect
	hoverController := gtk.NewEventControllerMotion()
	hoverController.ConnectEnter(func(x, y float64) {
		box.AddCSSClass("recording-item-hover")
	})
	hoverController.ConnectLeave(func() {
		box.RemoveCSSClass("recording-item-hover")
	})
	box.AddController(hoverController)

	// Setup keyboard activation
	keyController := gtk.NewEventControllerKey()
	keyController.ConnectKeyPressed(func(keyval uint, keycode uint, state gdk.ModifierType) bool {
		if keyval == uint(gdk.KEY_Return) || keyval == uint(gdk.KEY_KP_Enter) || keyval == uint(gdk.KEY_space) {
			item.emitActivated()
			return true
		}
		return false
	})
	box.AddController(keyController)

	// Make focusable
	box.SetFocusable(true)
	box.SetFocusOnClick(true)

	return item
}

// Widget returns the underlying GTK widget.
func (i *RecordingListItem) Widget() *gtk.Box {
	return i.box
}

// GetRecording returns the recording associated with this item.
func (i *RecordingListItem) GetRecording() *db.Recording {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.recording
}

// SetSelected sets the selected state of the item.
func (i *RecordingListItem) SetSelected(selected bool) {
	i.mu.Lock()
	i.selected = selected
	i.mu.Unlock()

	if selected {
		i.box.AddCSSClass("recording-item-selected")
	} else {
		i.box.RemoveCSSClass("recording-item-selected")
	}
}

// IsSelected returns true if the item is selected.
func (i *RecordingListItem) IsSelected() bool {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.selected
}

// OnActivated registers a callback for when the item is activated (double-clicked or Enter pressed).
func (i *RecordingListItem) OnActivated(callback func(*db.Recording)) {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.onActivatedCallbacks = append(i.onActivatedCallbacks, callback)
}

// emitActivated triggers all activated callbacks.
func (i *RecordingListItem) emitActivated() {
	i.mu.RLock()
	callbacks := make([]func(*db.Recording), len(i.onActivatedCallbacks))
	copy(callbacks, i.onActivatedCallbacks)
	rec := i.recording
	i.mu.RUnlock()

	for _, cb := range callbacks {
		cb(rec)
	}
}

// OnDelete registers a callback for when the delete button is clicked.
func (i *RecordingListItem) OnDelete(callback func(*db.Recording)) {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.onDeleteCallbacks = append(i.onDeleteCallbacks, callback)
}

// emitDelete triggers all delete callbacks.
func (i *RecordingListItem) emitDelete() {
	i.mu.RLock()
	callbacks := make([]func(*db.Recording), len(i.onDeleteCallbacks))
	copy(callbacks, i.onDeleteCallbacks)
	rec := i.recording
	i.mu.RUnlock()

	for _, cb := range callbacks {
		cb(rec)
	}
}

// SetThumbnailLoading updates the loading state for thumbnail generation.
func (i *RecordingListItem) SetThumbnailLoading(loading bool) {
	if i.thumbnailWidget != nil {
		i.thumbnailWidget.SetLoading(loading)
	}
}

// UpdateThumbnail updates both the rendered thumbnail and the recording model.
func (i *RecordingListItem) UpdateThumbnail(data, mimeType string, generatedAt time.Time) {
	i.mu.Lock()
	i.recording.ThumbnailData = data
	i.recording.ThumbnailMIMEType = mimeType
	i.recording.ThumbnailGeneratedAt = &generatedAt
	i.mu.Unlock()

	if i.thumbnailWidget != nil {
		i.thumbnailWidget.SetLoading(false)
		if err := i.thumbnailWidget.SetThumbnailBase64(data, mimeType); err != nil {
			i.thumbnailWidget.ShowPlaceholder()
		}
	}
}

// ShowThumbnailPlaceholder shows placeholder state and removes loading indicator.
func (i *RecordingListItem) ShowThumbnailPlaceholder() {
	if i.thumbnailWidget != nil {
		i.thumbnailWidget.SetLoading(false)
		i.thumbnailWidget.ShowPlaceholder()
	}
}

// OnExport registers a callback for when the export is requested.
func (i *RecordingListItem) OnExport(callback func(*db.Recording)) {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.onExportCallbacks = append(i.onExportCallbacks, callback)
}

// emitExport triggers all export callbacks.
func (i *RecordingListItem) emitExport() {
	i.mu.RLock()
	callbacks := make([]func(*db.Recording), len(i.onExportCallbacks))
	copy(callbacks, i.onExportCallbacks)
	rec := i.recording
	i.mu.RUnlock()

	for _, cb := range callbacks {
		cb(rec)
	}
}

// formatDuration formats a duration as MM:SS or HH:MM:SS.
func formatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60

	if hours > 0 {
		return fmt.Sprintf("%d:%02d:%02d", hours, minutes, seconds)
	}
	return fmt.Sprintf("%d:%02d", minutes, seconds)
}

// formatStatus returns a human-readable status string.
func formatStatus(status string) string {
	switch status {
	case "completed":
		return "Transcribed"
	case "pending":
		return "Pending"
	case "error":
		return "Error"
	default:
		return status
	}
}

// formatDate formats a date for display.
func formatDate(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	if diff < 24*time.Hour {
		return "Today"
	}
	if diff < 48*time.Hour {
		return "Yesterday"
	}
	if diff < 7*24*time.Hour {
		return fmt.Sprintf("%d days ago", int(diff/(24*time.Hour)))
	}

	return t.Format("Jan 2, 2006")
}
