package ui

import (
	"os"
	"testing"
	"time"

	"verbal/internal/db"
)

func TestLibraryView_New(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()
	if view == nil {
		t.Fatal("NewLibraryView() returned nil")
	}

	if view.Widget() == nil {
		t.Error("Expected Widget() to return non-nil")
	}
}

func TestLibraryView_SetRecordings(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	recordings := []*db.Recording{
		{ID: 1, FilePath: "/path/to/video1.mp4", Duration: 60 * time.Second, TranscriptionStatus: "completed"},
		{ID: 2, FilePath: "/path/to/video2.mp4", Duration: 120 * time.Second, TranscriptionStatus: "pending"},
	}

	view.SetRecordings(recordings)

	// Verify items were created
	if len(view.items) != 2 {
		t.Errorf("Expected 2 items, got %d", len(view.items))
	}
}

func TestLibraryView_SetRecordings_ReplacesExistingRows(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	view.SetRecordings([]*db.Recording{
		{ID: 1, FilePath: "/path/to/video1.mp4", Duration: 60 * time.Second},
		{ID: 2, FilePath: "/path/to/video2.mp4", Duration: 120 * time.Second},
	})
	view.SetRecordings([]*db.Recording{
		{ID: 3, FilePath: "/path/to/video3.mp4", Duration: 180 * time.Second},
	})

	if len(view.items) != 1 {
		t.Fatalf("Expected 1 item after replacement, got %d", len(view.items))
	}
	if _, ok := view.itemsByRecording[1]; ok {
		t.Fatal("Old recording ID 1 should not remain indexed")
	}
	if _, ok := view.itemsByRecording[3]; !ok {
		t.Fatal("New recording ID 3 should be indexed")
	}
}

func TestLibraryView_SetRecordings_Empty(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	view.SetRecordings([]*db.Recording{})

	if len(view.items) != 0 {
		t.Errorf("Expected 0 items, got %d", len(view.items))
	}
}

func TestLibraryView_OnRecordingSelected(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	recordings := []*db.Recording{
		{ID: 1, FilePath: "/path/to/video1.mp4", Duration: 60 * time.Second, TranscriptionStatus: "completed"},
	}

	view.SetRecordings(recordings)

	var selected *db.Recording
	view.OnRecordingSelected(func(r *db.Recording) {
		selected = r
	})

	// Simulate selection by calling the first item's callback
	if len(view.items) > 0 {
		view.items[0].emitActivated()
	}

	if selected == nil {
		t.Error("Expected OnRecordingSelected callback to be called")
	}

	if selected != nil && selected.ID != 1 {
		t.Errorf("Expected recording ID 1, got %d", selected.ID)
	}
}

func TestLibraryView_OnRecordingDelete(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	recordings := []*db.Recording{
		{ID: 1, FilePath: "/path/to/video1.mp4", Duration: 60 * time.Second, TranscriptionStatus: "completed"},
	}

	view.SetRecordings(recordings)

	var deleted *db.Recording
	view.OnRecordingDelete(func(r *db.Recording) {
		deleted = r
	})

	// Simulate delete by calling the first item's callback
	if len(view.items) > 0 {
		view.items[0].emitDelete()
	}

	if deleted == nil {
		t.Error("Expected OnRecordingDelete callback to be called")
	}

	if deleted != nil && deleted.ID != 1 {
		t.Errorf("Expected recording ID 1, got %d", deleted.ID)
	}
}

func TestLibraryView_OnOpenFile(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	var called bool
	view.OnOpenFile(func() {
		called = true
	})

	view.emitOpenFile()

	if !called {
		t.Error("Expected OnOpenFile callback to be called")
	}
}

func TestLibraryView_OnSearch(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	var searchQuery string
	view.OnSearch(func(query string) {
		searchQuery = query
	})

	view.emitSearch("test query")

	if searchQuery != "test query" {
		t.Errorf("Expected search query 'test query', got '%s'", searchQuery)
	}
}

func TestLibraryView_GetSelectedRecordings(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	recordings := []*db.Recording{
		{ID: 1, FilePath: "/path/to/video1.mp4", Duration: 60 * time.Second, TranscriptionStatus: "completed"},
		{ID: 2, FilePath: "/path/to/video2.mp4", Duration: 120 * time.Second, TranscriptionStatus: "pending"},
		{ID: 3, FilePath: "/path/to/video3.mp4", Duration: 180 * time.Second, TranscriptionStatus: "completed"},
	}

	view.SetRecordings(recordings)

	// Initially no selections
	selected := view.GetSelectedRecordings()
	if len(selected) != 0 {
		t.Errorf("Expected 0 selected, got %d", len(selected))
	}

	// Select first and third items
	if len(view.items) >= 3 {
		view.items[0].SetSelected(true)
		view.items[2].SetSelected(true)
	}

	selected = view.GetSelectedRecordings()
	if len(selected) != 2 {
		t.Errorf("Expected 2 selected, got %d", len(selected))
	}
}

func TestLibraryView_ClearSelection(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	recordings := []*db.Recording{
		{ID: 1, FilePath: "/path/to/video1.mp4", Duration: 60 * time.Second, TranscriptionStatus: "completed"},
		{ID: 2, FilePath: "/path/to/video2.mp4", Duration: 120 * time.Second, TranscriptionStatus: "pending"},
	}

	view.SetRecordings(recordings)

	// Select all items
	for _, item := range view.items {
		item.SetSelected(true)
	}

	// Clear selection
	view.ClearSelection()

	// Verify all items are unselected
	for _, item := range view.items {
		if item.IsSelected() {
			t.Error("Expected item to be unselected after ClearSelection()")
		}
	}

	// Verify GetSelectedRecordings returns empty
	selected := view.GetSelectedRecordings()
	if len(selected) != 0 {
		t.Errorf("Expected 0 selected after ClearSelection(), got %d", len(selected))
	}
}

func TestLibraryView_ShowEmptyState(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()

	// Initially should show empty state when no recordings
	view.SetRecordings([]*db.Recording{})

	if !view.showingEmptyState {
		t.Error("Expected showingEmptyState to be true when no recordings")
	}

	// Add recordings
	view.SetRecordings([]*db.Recording{
		{ID: 1, FilePath: "/path/to/video.mp4", Duration: 60 * time.Second},
	})

	if view.showingEmptyState {
		t.Error("Expected showingEmptyState to be false when recordings exist")
	}
}

func TestLibraryView_UpdateThumbnailAndLoading(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	view := NewLibraryView()
	now := time.Now().UTC()

	recordings := []*db.Recording{
		{ID: 1, FilePath: "/path/to/video.mp4", Duration: 60 * time.Second},
	}
	view.SetRecordings(recordings)

	view.SetThumbnailLoading(1, true)
	view.UpdateThumbnail(1, "invalid-base64", "image/jpeg", now)

	rec := view.items[0].GetRecording()
	if rec.ThumbnailData != "invalid-base64" {
		t.Errorf("Expected thumbnail data to be updated on item recording")
	}
	if rec.ThumbnailGeneratedAt == nil {
		t.Fatal("Expected ThumbnailGeneratedAt to be set after UpdateThumbnail")
	}
}
