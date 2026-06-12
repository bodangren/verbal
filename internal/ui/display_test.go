package ui

import (
	"os"
	"sync"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

var (
	gtkInitOnce sync.Once
	gtkInitOk   bool
)

// canInitializeGTK reports whether GTK can be initialized in the current
// environment. It is safe to call from multiple tests; GTK is initialized at
// most once and the result is cached.
func canInitializeGTK() bool {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		return false
	}

	gtkInitOnce.Do(func() {
		defer func() {
			if r := recover(); r != nil {
				gtkInitOk = false
			}
		}()
		gtk.Init()
		gtkInitOk = true
	})

	return gtkInitOk
}
