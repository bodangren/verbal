package ui

import (
	"sync"
	"time"

	"verbal/internal/db"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// LibraryView is the main container for the recording library UI.
// It includes a search bar, recording list, and empty state view.
type LibraryView struct {
	box               *gtk.Box
	searchEntry       *gtk.SearchEntry
	listBox           *gtk.ListBox
	scrolledWindow    *gtk.ScrolledWindow
	emptyStateBox     *gtk.Box
	openFileBtn       *gtk.Button
	items             []*RecordingListItem
	showingEmptyState bool
	mu                sync.RWMutex

	onRecordingSelectedCallbacks []func(*db.Recording)
	onRecordingDeleteCallbacks   []func(*db.Recording)
	onOpenFileCallbacks          []func()
	onSearchCallbacks            []func(string)
	searchDebounceTimer          *time.Timer
}

// NewLibraryView creates a new library view component.
func NewLibraryView() *LibraryView {
	// Main container
	box := gtk.NewBox(gtk.OrientationVertical, 0)
	box.AddCSSClass("library-view")

	// Header with title and search
	headerBox := gtk.NewBox(gtk.OrientationVertical, 12)
	headerBox.SetMarginStart(24)
	headerBox.SetMarginEnd(24)
	headerBox.SetMarginTop(24)
	headerBox.SetMarginBottom(12)

	// Title row with Open File button
	titleBox := gtk.NewBox(gtk.OrientationHorizontal, 12)

	titleLabel := gtk.NewLabel("Recording Library")
	titleLabel.AddCSSClass("library-title")
	titleLabel.SetHExpand(true)
	titleLabel.SetHAlign(gtk.AlignStart)
	titleBox.Append(titleLabel)

	openFileBtn := gtk.NewButtonFromIconName("document-open-symbolic")
	openFileBtn.SetLabel("Open File")
	openFileBtn.AddCSSClass("library-open-btn")
	openFileBtn.SetTooltipText("Open a video file (Ctrl+O)")
	titleBox.Append(openFileBtn)

	headerBox.Append(titleBox)

	// Search entry
	searchEntry := gtk.NewSearchEntry()
	searchEntry.SetPlaceholderText("Search recordings...")
	searchEntry.AddCSSClass("library-search")
	searchEntry.SetHExpand(true)
	headerBox.Append(searchEntry)

	box.Append(headerBox)

	// Scrolled window for recording list
	scrolled := gtk.NewScrolledWindow()
	scrolled.SetHExpand(true)
	scrolled.SetVExpand(true)
	scrolled.SetPolicy(gtk.PolicyNever, gtk.PolicyAutomatic)
	scrolled.AddCSSClass("library-scrolled")

	// List box for recordings
	listBox := gtk.NewListBox()
	listBox.AddCSSClass("library-list")
	listBox.SetSelectionMode(gtk.SelectionNone)

	scrolled.SetChild(listBox)
	box.Append(scrolled)

	// Empty state view
	emptyBox := gtk.NewBox(gtk.OrientationVertical, 12)
	emptyBox.AddCSSClass("library-empty")
	emptyBox.SetHAlign(gtk.AlignCenter)
	emptyBox.SetVAlign(gtk.AlignCenter)
	emptyBox.SetMarginTop(48)
	emptyBox.SetMarginBottom(48)

	emptyIcon := gtk.NewLabel("🎬")
	emptyIcon.AddCSSClass("library-empty-icon")
	emptyBox.Append(emptyIcon)

	emptyTitle := gtk.NewLabel("No Recordings Yet")
	emptyTitle.AddCSSClass("library-empty-title")
	emptyBox.Append(emptyTitle)

	emptySubtitle := gtk.NewLabel("Open a video file to get started")
	emptySubtitle.AddCSSClass("library-empty-subtitle")
	emptyBox.Append(emptySubtitle)

	emptyOpenBtn := gtk.NewButtonWithLabel("Open Video File")
	emptyOpenBtn.AddCSSClass("library-empty-btn")
	emptyOpenBtn.AddCSSClass("suggested-action")
	emptyBox.Append(emptyOpenBtn)

	view := &LibraryView{
		box:               box,
		searchEntry:       searchEntry,
		listBox:           listBox,
		scrolledWindow:    scrolled,
		emptyStateBox:     emptyBox,
		openFileBtn:       openFileBtn,
		items:             make([]*RecordingListItem, 0),
		showingEmptyState: false,

		onRecordingSelectedCallbacks: make([]func(*db.Recording), 0),
		onRecordingDeleteCallbacks:   make([]func(*db.Recording), 0),
		onOpenFileCallbacks:          make([]func(), 0),
		onSearchCallbacks:            make([]func(string), 0),
	}

	// Connect search entry with debounce
	searchEntry.ConnectSearchChanged(func() {
		if view.searchDebounceTimer != nil {
			view.searchDebounceTimer.Stop()
		}
		view.searchDebounceTimer = time.AfterFunc(300*time.Millisecond, func() {
			query := searchEntry.Text()
			view.emitSearch(query)
		})
	})

	// Connect open file buttons
	openFileBtn.ConnectClicked(func() {
		view.emitOpenFile()
	})
	emptyOpenBtn.ConnectClicked(func() {
		view.emitOpenFile()
	})

	return view
}

// Widget returns the underlying GTK widget.
func (v *LibraryView) Widget() *gtk.Box {
	return v.box
}

// SetRecordings updates the list of displayed recordings.
func (v *LibraryView) SetRecordings(recordings []*db.Recording) {
	v.mu.Lock()
	defer v.mu.Unlock()

	// Clear existing items
	for _, item := range v.items {
		v.listBox.Remove(item.Widget())
	}
	v.items = make([]*RecordingListItem, 0, len(recordings))

	// Show/hide empty state
	if len(recordings) == 0 {
		v.showEmptyState()
	} else {
		v.hideEmptyState()

		// Create and add new items
		for _, rec := range recordings {
			item := NewRecordingListItem(rec)

			// Connect callbacks
			item.OnActivated(func(r *db.Recording) {
				v.emitRecordingSelected(r)
			})
			item.OnDelete(func(r *db.Recording) {
				v.emitRecordingDelete(r)
			})

			v.items = append(v.items, item)
			v.listBox.Append(item.Widget())
		}
	}
}

// showEmptyState shows the empty state view.
func (v *LibraryView) showEmptyState() {
	v.showingEmptyState = true
	v.scrolledWindow.SetVisible(false)
	if v.emptyStateBox.Parent() == nil {
		v.box.Append(v.emptyStateBox)
	}
	v.emptyStateBox.SetVisible(true)
}

// hideEmptyState hides the empty state view and shows the list.
func (v *LibraryView) hideEmptyState() {
	v.showingEmptyState = false
	v.emptyStateBox.SetVisible(false)
	v.scrolledWindow.SetVisible(true)
}

// GetSelectedRecordings returns all currently selected recordings.
func (v *LibraryView) GetSelectedRecordings() []*db.Recording {
	v.mu.RLock()
	defer v.mu.RUnlock()

	var selected []*db.Recording
	for _, item := range v.items {
		if item.IsSelected() {
			selected = append(selected, item.GetRecording())
		}
	}
	return selected
}

// ClearSelection clears all selections.
func (v *LibraryView) ClearSelection() {
	v.mu.Lock()
	defer v.mu.Unlock()

	for _, item := range v.items {
		item.SetSelected(false)
	}
}

// SetSearchQuery sets the search entry text.
func (v *LibraryView) SetSearchQuery(query string) {
	v.searchEntry.SetText(query)
}

// OnRecordingSelected registers a callback for when a recording is selected/activated.
func (v *LibraryView) OnRecordingSelected(callback func(*db.Recording)) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.onRecordingSelectedCallbacks = append(v.onRecordingSelectedCallbacks, callback)
}

// emitRecordingSelected triggers all recording selected callbacks.
func (v *LibraryView) emitRecordingSelected(rec *db.Recording) {
	v.mu.RLock()
	callbacks := make([]func(*db.Recording), len(v.onRecordingSelectedCallbacks))
	copy(callbacks, v.onRecordingSelectedCallbacks)
	v.mu.RUnlock()

	for _, cb := range callbacks {
		cb(rec)
	}
}

// OnRecordingDelete registers a callback for when a recording delete is requested.
func (v *LibraryView) OnRecordingDelete(callback func(*db.Recording)) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.onRecordingDeleteCallbacks = append(v.onRecordingDeleteCallbacks, callback)
}

// emitRecordingDelete triggers all recording delete callbacks.
func (v *LibraryView) emitRecordingDelete(rec *db.Recording) {
	v.mu.RLock()
	callbacks := make([]func(*db.Recording), len(v.onRecordingDeleteCallbacks))
	copy(callbacks, v.onRecordingDeleteCallbacks)
	v.mu.RUnlock()

	for _, cb := range callbacks {
		cb(rec)
	}
}

// OnOpenFile registers a callback for when the open file button is clicked.
func (v *LibraryView) OnOpenFile(callback func()) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.onOpenFileCallbacks = append(v.onOpenFileCallbacks, callback)
}

// emitOpenFile triggers all open file callbacks.
func (v *LibraryView) emitOpenFile() {
	v.mu.RLock()
	callbacks := make([]func(), len(v.onOpenFileCallbacks))
	copy(callbacks, v.onOpenFileCallbacks)
	v.mu.RUnlock()

	for _, cb := range callbacks {
		cb()
	}
}

// OnSearch registers a callback for when the search query changes.
func (v *LibraryView) OnSearch(callback func(string)) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.onSearchCallbacks = append(v.onSearchCallbacks, callback)
}

// emitSearch triggers all search callbacks.
func (v *LibraryView) emitSearch(query string) {
	v.mu.RLock()
	callbacks := make([]func(string), len(v.onSearchCallbacks))
	copy(callbacks, v.onSearchCallbacks)
	v.mu.RUnlock()

	for _, cb := range callbacks {
		cb(query)
	}
}

// FocusSearch focuses the search entry.
func (v *LibraryView) FocusSearch() {
	v.searchEntry.GrabFocus()
}
