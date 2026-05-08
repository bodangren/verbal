package ui

import (
	"testing"
	"time"
)

func TestWaveformWidget_SetTooltipEnabled(te *testing.T) {
	ww := NewWaveformWidget()
	if ww.tooltipEnabled {
		te.Error("Expected tooltipEnabled to be false by default")
	}
	ww.SetTooltipEnabled(true)
	if !ww.tooltipEnabled {
		te.Error("Expected tooltipEnabled to be true after SetTooltipEnabled(true)")
	}
	ww.SetTooltipEnabled(false)
	if ww.tooltipEnabled {
		te.Error("Expected tooltipEnabled to be false after SetTooltipEnabled(false)")
	}
}

func TestWaveformWidget_HideTooltip(te *testing.T) {
	ww := NewWaveformWidget()
	ww.SetTooltipEnabled(true)
	ww.ShowTooltip(30*time.Second, 100, 50)
	ww.HideTooltip()
	if ww.tooltipWindow == nil {
		te.Error("Expected tooltipWindow to be initialized")
	}
}

func TestWaveformWidget_ShowTooltip(te *testing.T) {
	ww := NewWaveformWidget()
	ww.SetTooltipEnabled(true)
	ww.ShowTooltip(30*time.Second, 100, 50)
	if ww.tooltipLabel == nil {
		te.Error("Expected tooltipLabel to be initialized")
	}
	if ww.tooltipLabel.Text() != "0:30" {
		te.Errorf("Expected tooltip label '0:30', got %q", ww.tooltipLabel.Text())
	}
}

func TestWaveformWidget_TooltipPosition(te *testing.T) {
	tests := []struct {
		name     string
		pos      time.Duration
		expected string
	}{
		{"zero", 0, "0:00"},
		{"seconds", 45 * time.Second, "0:45"},
		{"minutes", 90 * time.Second, "1:30"},
		{"hours", 3661 * time.Second, "1:01:01"},
	}

	ww := NewWaveformWidget()
	for _, tt := range tests {
		te.Run(tt.name, func(t *testing.T) {
			ww.ShowTooltip(tt.pos, 100, 50)
			if ww.tooltipLabel.Text() != tt.expected {
				t.Errorf("Expected %q, got %q", tt.expected, ww.tooltipLabel.Text())
			}
		})
	}
}

func TestWaveformWidget_translateToScreen(te *testing.T) {
	ww := NewWaveformWidget()

	screenX, screenY := ww.translateToScreen(100, 50)

	if screenX <= 0 {
		te.Errorf("Expected positive screenX, got %v", screenX)
	}
	if screenY <= 0 {
		te.Errorf("Expected positive screenY, got %v", screenY)
	}

	screenX2, screenY2 := ww.translateToScreen(200, 100)
	if screenX2 <= screenX {
		te.Errorf("Expected screenX2 > screenX, got %v <= %v", screenX2, screenX)
	}
	if screenY2 != screenY {
		te.Errorf("Expected screenY2 == screenY (vertical offset only), got %v != %v", screenY2, screenY)
	}
}