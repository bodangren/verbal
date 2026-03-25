package ui

import (
	"github.com/diamondburned/gotk4/pkg/gdk/v4"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

const ApplicationCSS = `
window {
  background-color: @theme_bg_color;
  color: @theme_fg_color;
}

.title-label {
  font-size: 18px;
  font-weight: bold;
  margin: 12px;
}

.action-button {
  padding: 8px 16px;
  margin: 4px;
  border-radius: 6px;
}

.action-button.suggested-action {
  background-color: @accent_bg_color;
  color: @accent_fg_color;
}

.status-label {
  font-style: italic;
  color: @insensitive_fg_color;
  margin: 8px;
}
`

func LoadApplicationCSS() *gtk.CSSProvider {
	provider := gtk.NewCSSProvider()
	provider.LoadFromData(ApplicationCSS)

	display := gdk.DisplayGetDefault()
	if display != nil {
		gtk.StyleContextAddProviderForDisplay(
			display,
			provider,
			gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
		)
	}

	return provider
}
