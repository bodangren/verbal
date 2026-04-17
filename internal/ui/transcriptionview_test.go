package ui

import (
	"errors"
	"testing"
)

func TestTranscriptionView_SetErrorShowsCopyableScrollableText(t *testing.T) {
	if !hasDisplay() {
		t.Skip("No display available")
	}

	view := NewTranscriptionView()
	longErr := errors.New("transcription failed: Google request failed after 4 attempt(s): context deadline exceeded (Client.Timeout exceeded while awaiting headers)")

	view.SetError(longErr)

	if view.label.Text() != "Transcription Error" {
		t.Fatalf("Expected title to be Transcription Error, got %q", view.label.Text())
	}
	if !view.label.Wrap() {
		t.Fatal("Expected error label to wrap")
	}
	if !view.label.Selectable() {
		t.Fatal("Expected error label to be selectable")
	}

	start, end := view.buffer.Bounds()
	if got := start.Text(end); got != longErr.Error() {
		t.Fatalf("Expected full error in text buffer, got %q", got)
	}
}
