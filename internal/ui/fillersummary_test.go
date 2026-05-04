package ui

import (
	"testing"

	"verbal/internal/filler"
)

func TestFillerSummaryWidget_UpdateWithFillers(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	widget := NewFillerSummaryWidget()

	fillers := []*filler.FillerWord{
		{Text: "um", Start: 1.0, End: 1.2, Type: filler.TypeShortFiller},
		{Text: "uh", Start: 2.0, End: 2.1, Type: filler.TypeShortFiller},
		{Text: "like", Start: 3.0, End: 3.3, Type: filler.TypeHesitation},
		{Text: "the", Start: 4.0, End: 4.2, Type: filler.TypeRepetition},
	}

	widget.UpdateWithFillers(fillers)

	if len(widget.fillers) != 4 {
		t.Errorf("expected 4 fillers, got %d", len(widget.fillers))
	}

	if widget.currentIndex != -1 {
		t.Errorf("expected currentIndex -1 initially, got %d", widget.currentIndex)
	}
}

func TestFillerSummaryWidget_Clear(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	widget := NewFillerSummaryWidget()

	fillers := []*filler.FillerWord{
		{Text: "um", Start: 1.0, End: 1.2, Type: filler.TypeShortFiller},
	}

	widget.UpdateWithFillers(fillers)
	widget.Clear()

	if len(widget.fillers) != 0 {
		t.Errorf("expected 0 fillers after clear, got %d", len(widget.fillers))
	}

	if widget.currentIndex != -1 {
		t.Errorf("expected currentIndex -1 after clear, got %d", widget.currentIndex)
	}
}

func TestFillerSummaryWidget_Navigation(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	widget := NewFillerSummaryWidget()

	fillers := []*filler.FillerWord{
		{Text: "um", Start: 1.0, End: 1.2, Type: filler.TypeShortFiller},
		{Text: "uh", Start: 2.0, End: 2.1, Type: filler.TypeShortFiller},
		{Text: "like", Start: 3.0, End: 3.3, Type: filler.TypeHesitation},
	}

	widget.UpdateWithFillers(fillers)

	if widget.currentIndex != -1 {
		t.Errorf("expected currentIndex -1 initially, got %d", widget.currentIndex)
	}
}

func TestFillerSummaryWidget_GetFillers(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	widget := NewFillerSummaryWidget()

	fillers := []*filler.FillerWord{
		{Text: "um", Start: 1.0, End: 1.2, Type: filler.TypeShortFiller},
	}

	widget.UpdateWithFillers(fillers)

	got := widget.GetFillers()
	if len(got) != 1 {
		t.Errorf("expected 1 filler, got %d", len(got))
	}

	if got[0].Text != "um" {
		t.Errorf("expected filler text 'um', got '%s'", got[0].Text)
	}
}