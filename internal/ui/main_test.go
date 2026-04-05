package ui

import (
	"os"
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

func TestMain(m *testing.M) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		os.Exit(0)
	}
	gtk.Init()
	os.Exit(m.Run())
}
