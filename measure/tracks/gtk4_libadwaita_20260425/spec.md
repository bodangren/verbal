# GTK4 Libadwaita Integration

## Overview
Integrate Libadwaita for modern GNOME HIG compliance via gotk4-adwaita bindings.

## Background
- gotk4-adwaita (github.com/diamondburned/gotk4-adwaita) provides Go bindings for Libadwaita 1.5-1.7
- Requires Go >= 1.24 (project uses Go 1.25.0, compatible)
- libadwaita-1-dev 1.5.0 installed on system
- Bindings are auto-generated from GIR data

## Components to Integrate

### Adwaita Application
- `adw.Application` - GNOME-style application with proper lifecycle
- `adw.ApplicationWindow` - Window with Adwaita styling, breakpoint support

### Adwaita-Specific Widgets
- `adw.Clamp` - Content width limiting for readability
- `adw.Breakpoint` - Responsive layout breakpoints
- `adw.PreferencesGroup` / `adw.PreferencesPage` - Settings UI
- `adw.ActionRow`, `adw.EntryRow`, `adw.ComboRow` - Form rows

## Migration Strategy
1. Replace `gtk.ApplicationWindow` with `adw.ApplicationWindow` in main.go
2. Add `adw.Init()` after `gtk.Init()`
3. Use `adw.Clamp` for content width limiting in key views
4. Replace settings UI rows with adw row types

## Acceptance Criteria
- [x] Dependency added: gotk4-adwaita/pkg/adw
- [x] Adwaita.ApplicationWindow used in main.go
- [x] Adwaita.Init() called properly
- [x] Tests pass
- [ ] Build succeeds
- [ ] Tech debt updated
- [ ] Lessons learned updated
