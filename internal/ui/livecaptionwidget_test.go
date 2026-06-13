package ui

import (
	"testing"
)

func TestLiveCaptionWidget_Basic(t *testing.T) {
	widget := NewLiveCaptionWidget()
	if widget == nil {
		t.Fatal("expected non-nil LiveCaptionWidget")
	}

	widget.SetStatus("test status")
	widget.Show()

	if widget.IsMinimized() {
		t.Error("expected widget to not be minimized after Show()")
	}

	widget.Hide()
	if !widget.IsMinimized() {
		t.Error("expected widget to be minimized after Hide()")
	}

	widget.Clear()
}
