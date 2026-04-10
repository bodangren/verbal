package ui

import (
	"encoding/base64"
	"os"
	"testing"
	"time"
)

func TestThumbnailWidget_New(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewThumbnailWidget()
	if widget == nil {
		t.Fatal("NewThumbnailWidget() returned nil")
	}
	if widget.Widget() == nil {
		t.Fatal("Widget() returned nil")
	}
}

func TestThumbnailWidget_SetDuration(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewThumbnailWidget()
	widget.SetDuration(95 * time.Second)
	if widget.durationLabel.Label() != "1:35" {
		t.Errorf("Expected duration label 1:35, got %q", widget.durationLabel.Label())
	}
}

func TestDecodeThumbnailPixbuf_RejectsInvalidPayload(t *testing.T) {
	if _, err := decodeThumbnailPixbuf("not-base64", "image/jpeg"); err == nil {
		t.Fatal("Expected decodeThumbnailPixbuf to fail for invalid base64")
	}
}

func TestDecodeThumbnailPixbuf_AcceptsValidGIF(t *testing.T) {
	// 1x1 transparent GIF.
	gifBase64 := "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
	if _, err := decodeThumbnailPixbuf(gifBase64, "image/gif"); err != nil {
		t.Fatalf("Expected valid GIF payload to decode, got error: %v", err)
	}
}

func TestThumbnailWidget_SetThumbnailBase64Fallback(t *testing.T) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		t.Skip("No display available")
	}
	widget := NewThumbnailWidget()
	widget.ShowPlaceholder()

	// valid base64 but not image data: should return error and keep placeholder visible.
	payload := base64.StdEncoding.EncodeToString([]byte("not-an-image"))
	if err := widget.SetThumbnailBase64(payload, "image/jpeg"); err == nil {
		t.Fatal("Expected SetThumbnailBase64 to fail for invalid image payload")
	}
	if !widget.placeholder.Visible() {
		t.Fatal("Expected placeholder to remain visible on decode failure")
	}
}
