package ui

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/diamondburned/gotk4/pkg/gdkpixbuf/v2"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// ThumbnailWidget renders a 16:9 recording thumbnail with loading and duration overlays.
type ThumbnailWidget struct {
	overlay       *gtk.Overlay
	picture       *gtk.Picture
	placeholder   *gtk.Label
	spinner       *gtk.Spinner
	durationLabel *gtk.Label
}

// NewThumbnailWidget creates a thumbnail widget initialized to placeholder state.
func NewThumbnailWidget() *ThumbnailWidget {
	picture := gtk.NewPicture()
	picture.SetCanShrink(true)
	picture.SetKeepAspectRatio(true)
	picture.SetContentFit(gtk.ContentFitCover)
	picture.SetSizeRequest(96, 54)
	picture.AddCSSClass("recording-thumbnail-picture")

	overlay := gtk.NewOverlay()
	overlay.SetChild(picture)
	overlay.AddCSSClass("recording-thumbnail")
	overlay.SetSizeRequest(96, 54)

	placeholder := gtk.NewLabel("🎬")
	placeholder.SetHAlign(gtk.AlignCenter)
	placeholder.SetVAlign(gtk.AlignCenter)
	placeholder.AddCSSClass("recording-thumbnail-placeholder")
	overlay.AddOverlay(placeholder)

	spinner := gtk.NewSpinner()
	spinner.SetHAlign(gtk.AlignCenter)
	spinner.SetVAlign(gtk.AlignCenter)
	spinner.SetVisible(false)
	spinner.AddCSSClass("recording-thumbnail-spinner")
	overlay.AddOverlay(spinner)

	durationLabel := gtk.NewLabel("0:00")
	durationLabel.SetHAlign(gtk.AlignEnd)
	durationLabel.SetVAlign(gtk.AlignEnd)
	durationLabel.SetMarginEnd(6)
	durationLabel.SetMarginBottom(4)
	durationLabel.AddCSSClass("recording-thumbnail-duration")
	overlay.AddOverlay(durationLabel)

	return &ThumbnailWidget{
		overlay:       overlay,
		picture:       picture,
		placeholder:   placeholder,
		spinner:       spinner,
		durationLabel: durationLabel,
	}
}

// Widget returns the GTK widget for this component.
func (tw *ThumbnailWidget) Widget() *gtk.Overlay {
	return tw.overlay
}

// SetDuration updates the bottom-right duration overlay.
func (tw *ThumbnailWidget) SetDuration(duration time.Duration) {
	tw.durationLabel.SetLabel(formatDuration(duration))
}

// SetLoading toggles the loading spinner overlay.
func (tw *ThumbnailWidget) SetLoading(loading bool) {
	if loading {
		tw.spinner.SetVisible(true)
		tw.spinner.Start()
		return
	}

	tw.spinner.Stop()
	tw.spinner.SetVisible(false)
}

// SetThumbnailBase64 updates the thumbnail image using a base64-encoded payload.
func (tw *ThumbnailWidget) SetThumbnailBase64(data, mimeType string) error {
	pixbuf, err := decodeThumbnailPixbuf(data, mimeType)
	if err != nil {
		tw.ShowPlaceholder()
		return err
	}

	tw.picture.SetPixbuf(pixbuf)
	tw.picture.SetVisible(true)
	tw.placeholder.SetVisible(false)
	return nil
}

// ShowPlaceholder displays the generic video placeholder icon.
func (tw *ThumbnailWidget) ShowPlaceholder() {
	tw.picture.SetPaintable(nil)
	tw.picture.SetVisible(false)
	tw.placeholder.SetVisible(true)
}

func decodeThumbnailPixbuf(data, mimeType string) (*gdkpixbuf.Pixbuf, error) {
	if strings.TrimSpace(data) == "" {
		return nil, errors.New("thumbnail payload is empty")
	}

	bytes, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, fmt.Errorf("decode thumbnail base64: %w", err)
	}

	loader, err := gdkpixbuf.NewPixbufLoaderWithMIMEType(strings.TrimSpace(mimeType))
	if err != nil {
		loader = gdkpixbuf.NewPixbufLoader()
	}

	if err := loader.Write(bytes); err != nil {
		return nil, fmt.Errorf("write pixbuf payload: %w", err)
	}
	if err := loader.Close(); err != nil {
		return nil, fmt.Errorf("close pixbuf loader: %w", err)
	}

	pixbuf := loader.Pixbuf()
	if pixbuf == nil {
		return nil, errors.New("pixbuf loader returned nil image")
	}

	return pixbuf, nil
}
