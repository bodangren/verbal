package ui

import (
	"context"
	"testing"

	"github.com/diamondburned/gotk4-adwaita/pkg/adw"
	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

func TestAdwaitaBindings(t *testing.T) {
	if !canInitializeGTK() {
		t.Skip("No usable display available")
	}

	gtk.Init()
	adw.Init()

	app := adw.NewApplication("test.adwaita", 0)
	app.Register(context.Background())

	win := adw.NewApplicationWindow(&app.Application)
	win.SetTitle("Adwaita Test Window")

	if title := win.Title(); title != "Adwaita Test Window" {
		t.Errorf("expected title 'Adwaita Test Window', got %q", title)
	}

	win.Destroy()
	app.Quit()
}

func TestAdwaitaApplicationWindow(t *testing.T) {
	if !canInitializeGTK() {
		t.Skip("No usable display available")
	}

	gtk.Init()
	adw.Init()

	app := adw.NewApplication("test.adwaita.app", 0)
	app.Register(context.Background())

	win := adw.NewApplicationWindow(&app.Application)
	win.SetTitle("Test Application Window")

	content := gtk.NewLabel("Hello from Adwaita!")
	win.SetContent(content)

	win.Destroy()
	app.Quit()
}
