package ui

import (
	"github.com/diamondburned/gotk4/pkg/gdk/v4"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

const ApplicationCSS = `
/* === VERBAL DESIGN SYSTEM - Professional Precision Studio === */

/* --- Base Surfaces --- */
window {
	background-color: #1E1E1E;
	color: #F5F5F5;
}

box, paned, grid, list-box {
	background-color: #1E1E1E;
}

/* --- Typography --- */
.title-label {
	font-weight: bold;
	margin-bottom: 12px;
}

.status-label {
	font-style: italic;
	margin-top: 8px;
}

.body-lg {
	font-size: 14px;
	font-weight: 500;
}

.body-md {
	font-size: 13px;
	font-weight: 400;
}

.mono {
	font-family: "JetBrains Mono", "Fira Code", monospace;
	font-size: 12px;
}

/* --- Buttons & Actions --- */
.action-button {
	margin: 4px;
	padding: 8px;
}

/* --- Transcription View (Core Feature) --- */
.transcription-view {
	background-color: #252525;
	border: 1px solid #3D3D3D;
	border-radius: 8px;
	padding: 12px;
	margin-top: 16px;
}

/* Word Labels - monospace for precision */
.word-label {
	font-family: "JetBrains Mono", "Fira Code", monospace;
	font-size: 12px;
	padding: 2px 4px;
	border-radius: 4px;
	transition: background-color 100ms ease;
}

.word-label:hover {
	background-color: rgba(99, 102, 241, 0.15);
}

.word-highlighted {
	background-color: #6366F1;
	color: #FFFFFF;
	font-weight: 600;
}

.word-highlighted:hover {
	background-color: #818CF8;
	color: #FFFFFF;
}

.word-highlighted:focus {
	outline: 2px solid #4F46E5;
	outline-offset: 2px;
}

.word-hover {
	background-color: rgba(99, 102, 241, 0.2);
}

.word-container {
	padding: 4px;
}

.word-selected {
	background-color: rgba(99, 102, 241, 0.25);
	border: 1px solid #6366F1;
}

.word-selected:hover {
	background-color: rgba(99, 102, 241, 0.35);
}

/* --- Playback Toolbar --- */
.playback-toolbar {
	background-color: #2A2A2A;
	border-bottom: 1px solid #3D3D3D;
}

/* --- Error States --- */
.error-label {
	color: #EF4444;
	font-weight: 500;
	margin: 8px 12px;
	padding: 8px 12px;
	background-color: #2D1B1B;
	border-left: 3px solid #EF4444;
	border-radius: 0 4px 4px 0;
}

/* --- Library View --- */
.library-view {
	background-color: #1E1E1E;
}

.library-title {
	font-size: 18px;
	font-weight: 700;
}

.library-search {
	min-width: 300px;
	background-color: #2A2A2A;
	border: 1px solid #3D3D3D;
	border-radius: 6px;
	color: #F5F5F5;
}

.library-search:focus {
	border-color: #6366F1;
}

.library-scrolled {
	border-top: 1px solid #2F2F2F;
}

.library-list {
	background-color: transparent;
}

.library-list row {
	padding: 0;
	background-color: transparent;
}

/* --- Recording List Item --- */
.recording-list-item {
	background-color: #252525;
	border: 1px solid #3D3D3D;
	border-radius: 6px;
	transition: all 150ms ease;
}

.recording-list-item:hover,
.recording-item-hover {
	background-color: #2A2A2A;
	border-color: #505050;
}

.recording-item-selected {
	background-color: rgba(99, 102, 241, 0.1);
	border-color: #6366F1;
	box-shadow: 0 0 0 1px #6366F1;
}

.recording-unavailable {
	opacity: 0.6;
	background-color: rgba(0, 0, 0, 0.15);
}

.recording-unavailable .recording-filename {
	color: #707070;
}

.recording-unavailable .recording-thumbnail {
	filter: grayscale(100%);
	opacity: 0.7;
}

.recording-icon {
	background-color: #2A2A2A;
	border-radius: 6px;
}

.recording-icon-label {
	font-size: 24px;
	color: #A0A0A0;
}

.recording-thumbnail {
	background-color: #333333;
	border-radius: 6px;
}

.recording-thumbnail-placeholder {
	font-size: 20px;
	color: #707070;
}

.recording-thumbnail-duration {
	background-color: rgba(0, 0, 0, 0.75);
	color: #F5F5F5;
	font-family: "JetBrains Mono", monospace;
	font-size: 10px;
	padding: 2px 6px;
	border-radius: 4px;
}

.recording-filename {
	font-weight: 600;
	font-size: 13px;
	color: #F5F5F5;
}

.recording-duration {
	font-family: "JetBrains Mono", monospace;
	font-size: 11px;
	color: #A0A0A0;
}

.recording-status {
	font-family: "JetBrains Mono", monospace;
	font-size: 10px;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	padding: 2px 8px;
	border-radius: 0 4px 4px 0;
	border-left: 3px solid;
}

.recording-status-completed {
	border-left-color: #22C55E;
	color: #22C55E;
}

.recording-status-pending {
	border-left-color: #A0A0A0;
	color: #A0A0A0;
}

.recording-status-error {
	border-left-color: #EF4444;
	color: #EF4444;
}

.recording-date {
	font-size: 11px;
	color: #707070;
}

.recording-delete-btn {
	opacity: 0.5;
	transition: opacity 150ms ease;
}

.recording-delete-btn:hover {
	opacity: 1;
	color: #EF4444;
}

/* --- Empty States --- */
.library-empty {
	opacity: 0.8;
}

.library-empty-icon {
	font-size: 48px;
	color: #707070;
	margin-bottom: 12px;
}

.library-empty-title {
	font-size: 15px;
	font-weight: 600;
	color: #F5F5F5;
	margin-bottom: 4px;
}

.library-empty-subtitle {
	font-size: 12px;
	color: #707070;
	margin-bottom: 16px;
}

.library-empty-btn {
	padding: 8px 24px;
	background-color: #6366F1;
	color: #FFFFFF;
	border-radius: 6px;
}

.library-empty-btn:hover {
	background-color: #818CF8;
}

/* --- Settings Window --- */
.settings-title {
	font-size: 16px;
	font-weight: 700;
}

.setting-label {
	font-weight: 600;
	font-size: 12px;
	color: #F5F5F5;
}

.success-label {
	color: #22C55E;
	font-weight: 500;
}

.settings-panel {
	background-color: #252525;
	border: 1px solid #3D3D3D;
	border-radius: 8px;
}

/* --- Waveform Widget --- */
.waveform-widget {
	background-color: #252525;
	border-radius: 6px;
}

.waveform-sample {
	background-color: #707070;
}

.waveform-sample-played {
	background-color: #6366F1;
}

.waveform-playhead {
	background-color: #6366F1;
	width: 2px;
}

/* --- Dialogs --- */
.dialog {
	background-color: #2A2A2A;
	border: 1px solid #3D3D3D;
	border-radius: 8px;
}

.dialog-title {
	font-size: 16px;
	font-weight: 600;
	color: #F5F5F5;
}

/* --- Scale/Slider --- */
scale {
	background-color: #3D3D3D;
}

scale slider {
	background-color: #6366F1;
}

scale trough {
	background-color: #333333;
}

/* --- Labels --- */
.dim-label {
	color: #707070;
}

.text-secondary {
	color: #A0A0A0;
}

.text-tertiary {
	color: #707070;
}
`

func LoadApplicationCSS() {
	display := gdk.DisplayGetDefault()
	if display == nil {
		return
	}

	provider := gtk.NewCSSProvider()
	provider.LoadFromData(ApplicationCSS)

	gtk.StyleContextAddProviderForDisplay(display, provider, gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
}