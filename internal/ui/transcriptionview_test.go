package ui

import (
	"errors"
	"os"
	"testing"

	"verbal/internal/ai"
)

func skipIfNoDisplay(t *testing.T) {
	if display := os.Getenv("DISPLAY"); display == "" {
		if wayland := os.Getenv("WAYLAND_DISPLAY"); wayland == "" {
			t.Skip("skipping: no display available")
		}
	}
}

func TestTranscriptionView_New(t *testing.T) {
	skipIfNoDisplay(t)

	tv := NewTranscriptionView()
	if tv == nil {
		t.Fatal("NewTranscriptionView returned nil")
	}
	if tv.Widget() == nil {
		t.Error("Widget() returned nil")
	}
}

func TestTranscriptionView_SetResult(t *testing.T) {
	skipIfNoDisplay(t)

	tv := NewTranscriptionView()

	result := &ai.TranscriptionResult{
		Text:     "Hello world",
		Language: "en",
		Duration: 5.5,
		Provider: "test",
		Words: []ai.WordTimestamp{
			{Word: "Hello", Start: 0.0, End: 0.5},
			{Word: "world", Start: 0.6, End: 1.0},
		},
	}

	tv.SetResult(result)

	if !tv.Widget().Visible() {
		t.Error("widget should be visible after SetResult")
	}
}

func TestTranscriptionView_SetStatus(t *testing.T) {
	skipIfNoDisplay(t)

	tv := NewTranscriptionView()
	tv.SetStatus("Processing...")

	if !tv.Widget().Visible() {
		t.Error("widget should be visible after SetStatus")
	}
}

func TestTranscriptionView_SetError(t *testing.T) {
	skipIfNoDisplay(t)

	tv := NewTranscriptionView()
	tv.SetError(errors.New("test error"))

	if !tv.Widget().Visible() {
		t.Error("widget should be visible after SetError")
	}
}

func TestTranscriptionView_Clear(t *testing.T) {
	skipIfNoDisplay(t)

	tv := NewTranscriptionView()
	tv.SetStatus("Processing...")
	tv.Clear()

	if tv.Widget().Visible() {
		t.Error("widget should be hidden after Clear")
	}
}
