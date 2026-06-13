package ui

import (
	"context"
	"fmt"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// BatchQueueItemView is a view-model struct representing a single item
// in the batch transcription queue for display in the UI.
type BatchQueueItemView struct {
	ID       int64
	FilePath string
	Status   string
	Progress float64
}

// BatchQueueModel is the interface the panel uses to fetch queue items.
// Production code adapts *db.BatchQueueRepository; tests use a stub.
type BatchQueueModel interface {
	ListItems(ctx context.Context) ([]BatchQueueItemView, error)
}

// BatchQueuePanel displays the batch transcription queue as a sidebar
// panel with per-row progress bars and cancel/pause controls.
type BatchQueuePanel struct {
	box *gtk.ListBox

	model    BatchQueueModel
	items    []BatchQueueItemView

	onCancelItem  func(id int64)
	onPauseToggle func(paused bool)
	paused        bool
}

// NewBatchQueuePanel creates a new batch queue panel driven by the
// given model.
func NewBatchQueuePanel(model BatchQueueModel) *BatchQueuePanel {
	listBox := gtk.NewListBox()
	listBox.AddCSSClass("library-list")
	listBox.SetSelectionMode(gtk.SelectionNone)

	p := &BatchQueuePanel{
		box:   listBox,
		model: model,
		items: nil,
	}
	return p
}

// Widget returns the underlying GTK widget for embedding in a parent container.
func (p *BatchQueuePanel) Widget() *gtk.Widget {
	return &p.box.Widget
}

// Refresh fetches the latest items from the model and rebuilds the
// list rows. Must be called on the GTK main thread.
func (p *BatchQueuePanel) Refresh(ctx context.Context) error {
	items, err := p.model.ListItems(ctx)
	if err != nil {
		return err
	}
	p.items = items
	p.rebuildRows()
	return nil
}

// Snapshot returns a copy of the current item view state.
func (p *BatchQueuePanel) Snapshot() []BatchQueueItemView {
	if p.items == nil {
		return []BatchQueueItemView{}
	}
	result := make([]BatchQueueItemView, len(p.items))
	copy(result, p.items)
	return result
}

// SetOnCancelItem registers a callback invoked when a per-row cancel
// control is activated. The callback receives the item ID.
func (p *BatchQueuePanel) SetOnCancelItem(cb func(id int64)) {
	p.onCancelItem = cb
}

// SetOnPauseToggle registers a callback invoked when the queue-wide
// pause toggle changes state.
func (p *BatchQueuePanel) SetOnPauseToggle(cb func(paused bool)) {
	p.onPauseToggle = cb
}

// SetPaused sets the queue-wide pause state and fires the
// SetOnPauseToggle callback if registered.
func (p *BatchQueuePanel) SetPaused(paused bool) {
	p.paused = paused
	if p.onPauseToggle != nil {
		p.onPauseToggle(paused)
	}
}

// CancelItem fires the registered cancel callback with the given ID.
func (p *BatchQueuePanel) CancelItem(id int64) {
	if p.onCancelItem != nil {
		p.onCancelItem(id)
	}
}

// rebuildRows rebuilds the ListBox rows from the current items slice.
func (p *BatchQueuePanel) rebuildRows() {
	p.box.RemoveAll()

	for _, item := range p.items {
		row := gtk.NewListBoxRow()

		rowBox := gtk.NewBox(gtk.OrientationVertical, 4)
		rowBox.SetMarginStart(8)
		rowBox.SetMarginEnd(8)
		rowBox.SetMarginTop(4)
		rowBox.SetMarginBottom(4)

		headerBox := gtk.NewBox(gtk.OrientationHorizontal, 8)

		fileLabel := gtk.NewLabel(item.FilePath)
		fileLabel.SetHAlign(gtk.AlignStart)
		fileLabel.SetHExpand(true)
		fileLabel.SetEllipsize(3) // PANGO_ELLIPSIZE_END
		headerBox.Append(fileLabel)

		statusLabel := gtk.NewLabel(item.Status)
		statusLabel.AddCSSClass("mono")
		statusLabel.SetHAlign(gtk.AlignEnd)
		headerBox.Append(statusLabel)

		if item.Status == "processing" {
			cancelBtn := gtk.NewButtonFromIconName("process-stop-symbolic")
			cancelBtn.SetTooltipText("Cancel this item")
			cancelBtn.AddCSSClass("flat")
			cancelBtn.SetSensitive(true)
			itemID := item.ID
			cancelBtn.ConnectClicked(func() {
				p.CancelItem(itemID)
			})
			headerBox.Append(cancelBtn)
		}

		rowBox.Append(headerBox)

		progressBar := gtk.NewProgressBar()
		progressBar.SetFraction(item.Progress)
		progressBar.SetShowText(true)
		progressBar.SetText(fmt.Sprintf("%.0f%%", item.Progress*100))
		rowBox.Append(progressBar)

		row.SetChild(rowBox)
		p.box.Append(row)
	}
}
