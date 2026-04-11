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

/* Library View Styles */

.library-view {
	background-color: @window_bg_color;
}

.library-title {
	font-size: 18pt;
	font-weight: bold;
}

.library-search {
	min-width: 300px;
}

.library-scrolled {
	border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.library-list {
	background-color: transparent;
}

.library-list row {
	padding: 0;
	background-color: transparent;
}

/* Recording List Item Styles */

.recording-list-item {
	background-color: @card_bg_color;
	border-radius: 8px;
	border: 1px solid rgba(0, 0, 0, 0.08);
	transition: all 0.15s ease;
}

.recording-list-item:hover,
.recording-item-hover {
	background-color: @card_bg_color;
	border-color: rgba(0, 0, 0, 0.15);
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.recording-item-selected {
	background-color: rgba(53, 132, 228, 0.1);
	border-color: #3584E4;
	box-shadow: 0 0 0 1px #3584E4;
}

.recording-unavailable {
	opacity: 0.6;
	background-color: rgba(0, 0, 0, 0.03);
}

.recording-unavailable .recording-filename {
	color: @insensitive_fg_color;
}

.recording-unavailable .recording-thumbnail {
	filter: grayscale(100%);
	opacity: 0.7;
}

.recording-icon {
	background-color: rgba(0, 0, 0, 0.05);
	border-radius: 6px;
}

.recording-icon-label {
	font-size: 24px;
}

.recording-thumbnail {
	background-color: rgba(0, 0, 0, 0.10);
	border-radius: 6px;
	overflow: hidden;
}

.recording-thumbnail-placeholder {
	font-size: 20px;
	opacity: 0.85;
}

.recording-thumbnail-duration {
	background-color: rgba(0, 0, 0, 0.65);
	color: #FFFFFF;
	font-size: 8.5pt;
	padding: 1px 6px;
	border-radius: 8px;
}

.recording-filename {
	font-weight: 600;
	font-size: 11pt;
}

.recording-duration {
	font-size: 9pt;
	opacity: 0.7;
}

.recording-status {
	font-size: 8pt;
	padding: 2px 8px;
	border-radius: 12px;
	font-weight: 500;
}

.recording-status-completed {
	background-color: rgba(46, 160, 67, 0.15);
	color: #1A7F37;
}

.recording-status-pending {
	background-color: rgba(120, 120, 120, 0.15);
	color: #656D76;
}

.recording-status-error {
	background-color: rgba(192, 28, 40, 0.15);
	color: #C01C28;
}

.recording-date {
	font-size: 9pt;
	opacity: 0.6;
}

.recording-delete-btn {
	opacity: 0.6;
	transition: opacity 0.15s ease;
}

.recording-delete-btn:hover {
	opacity: 1;
	color: #C01C28;
}

/* Empty State Styles */

.library-empty {
	opacity: 0.8;
}

.library-empty-icon {
	font-size: 48px;
	margin-bottom: 12px;
}

.library-empty-title {
	font-size: 14pt;
	font-weight: bold;
	margin-bottom: 4px;
}

.library-empty-subtitle {
	font-size: 10pt;
	opacity: 0.7;
	margin-bottom: 16px;
}

.library-empty-btn {
	padding: 8px 24px;
}

/* Settings Window Styles */

.settings-title {
	font-size: 16pt;
	font-weight: bold;
}

.setting-label {
	font-weight: 600;
	font-size: 10pt;
}

.success-label {
	color: #1A7F37;
	font-weight: 500;
}

.settings-panel {
	background-color: @card_bg_color;
	border-radius: 8px;
	border: 1px solid rgba(0, 0, 0, 0.08);
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
