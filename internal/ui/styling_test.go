package ui

import (
	"strings"
	"testing"
)

func TestApplicationCSSNotEmpty(t *testing.T) {
	if strings.TrimSpace(ApplicationCSS) == "" {
		t.Error("ApplicationCSS should not be empty")
	}
}

func TestApplicationCSSContainsRequiredSelectors(t *testing.T) {
	requiredSelectors := []string{
		"window",
		".title-label",
		".action-button",
		".status-label",
	}

	for _, selector := range requiredSelectors {
		if !strings.Contains(ApplicationCSS, selector) {
			t.Errorf("ApplicationCSS missing required selector: %s", selector)
		}
	}
}

func TestApplicationCSSContainsSuggestedAction(t *testing.T) {
	if !strings.Contains(ApplicationCSS, ".suggested-action") {
		t.Error("ApplicationCSS should contain .suggested-action for primary buttons")
	}
}

func TestApplicationCSSThemeVariables(t *testing.T) {
	themeVars := []string{
		"@theme_bg_color",
		"@theme_fg_color",
		"@accent_bg_color",
	}

	for _, v := range themeVars {
		if !strings.Contains(ApplicationCSS, v) {
			t.Errorf("ApplicationCSS should use theme variable: %s", v)
		}
	}
}
