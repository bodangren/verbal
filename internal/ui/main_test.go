package ui

import (
	"os"
	"testing"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

func TestMain(m *testing.M) {
	gtk.Init()
	os.Exit(m.Run())
}
