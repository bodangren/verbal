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

.word-label {
	padding: 2px 4px;
	border-radius: 3px;
	transition: background-color 0.15s ease;
}

.word-label:hover {
	background-color: rgba(100, 100, 100, 0.15);
}

.word-highlighted {
	background-color: #3584E4;
	color: #FFFFFF;
	font-weight: bold;
}

.word-highlighted:hover {
	background-color: #1C71D8;
	color: #FFFFFF;
}

.word-highlighted:focus {
	outline: 2px solid #1A5FB4;
	outline-offset: 2px;
}

.word-hover {
	background-color: rgba(100, 100, 100, 0.2);
}

.word-container {
	padding: 4px;
}

.playback-toolbar {
	background-color: rgba(0, 0, 0, 0.03);
}

.error-label {
	color: #C01C28;
	font-weight: bold;
	margin: 8px 12px;
	padding: 8px 12px;
	background-color: rgba(192, 28, 40, 0.1);
	border-radius: 6px;
}

.word-selected {
	background-color: rgba(53, 132, 228, 0.3);
	outline: 1px solid #3584E4;
	outline-offset: 1px;
}

.word-selected:hover {
	background-color: rgba(53, 132, 228, 0.4);
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
