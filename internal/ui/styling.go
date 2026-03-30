package ui

import (
	"github.com/diamondburned/gotk4/pkg/gdk/v4"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

// ApplicationCSS contains the CSS stylesheet for the application.
// It defines styles for labels, buttons, and the transcription view.
const ApplicationCSS = `
.title-label {
	font-weight: bold;
	margin-bottom: 12px;
}

.status-label {
	font-style: italic;
	margin-top: 8px;
}

.action-button {
	margin: 4px;
	padding: 8px;
}

.dim-label {
	opacity: 0.7;
}

.transcription-view {
	background: rgba(0, 0, 0, 0.05);
	border-radius: 8px;
	padding: 12px;
	margin-top: 16px;
}
`

// LoadApplicationCSS loads the application CSS stylesheet into GTK.
// This should be called once during application initialization.
// If no display is available (e.g., in headless tests), this function does nothing.
func LoadApplicationCSS() {
	display := gdk.DisplayGetDefault()
	if display == nil {
		return
	}

	provider := gtk.NewCSSProvider()
	provider.LoadFromData(ApplicationCSS)

	gtk.StyleContextAddProviderForDisplay(display, provider, gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
}
