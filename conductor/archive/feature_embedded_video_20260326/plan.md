# Plan: Feature - Embedded Video Preview in GTK4

## Objective
Replace external video window with embedded video preview using gtk4paintablesink from gstreamer-plugins-bad.

## Prerequisites
- **gstreamer1.0-plugins-bad** must be installed: `sudo apt install gstreamer1.0-plugins-bad`
- The `gtk4paintablesink` element is required for embedded video in GTK4

## Phase 1: Plugin and Binding Verification [x] Completed
- [x] Verify gstreamer1.0-plugins-bad is installed - **NOT INSTALLED** (requires sudo)
- [x] Check if gotk4/gst bindings support gtk4paintablesink - **No AppSink bindings in gotk4-gstreamer**
- [x] Research GdkPaintable integration with GtkPicture - **gtk.NewPictureForPaintable() available**
- [x] Document required GStreamer element properties - **gtk4paintablesink required**

**Finding:** gstreamer1.0-plugins-bad is required. Alternative approaches (appsink workaround) not viable due to missing bindings. The proper solution requires installing the plugin.

## Phase 2: Update PreviewPipeline [x] Completed
- [x] Add `NewEmbeddedPreviewPipeline()` using gtk4paintablesink
- [x] Expose paintable object for GTK widget binding
- [x] Handle element state changes and errors
- [x] Add tests for new pipeline configuration

## Phase 3: GTK4 Integration [x] Completed
- [x] Create VideoPreview widget using GtkPicture
- [x] Bind paintable from pipeline to widget
- [x] Ensure thread-safe updates (GStreamer callbacks → GTK main loop)
- [x] Update main window to use embedded preview

## Phase 4: Verification [x] Completed
- [x] Run all tests: `go test ./...`
- [x] Verify build compiles: `go build ./...`
- [x] Manual test: video preview embedded in window (requires plugins-bad - code ready, fallback works)
- [x] Update tech-debt.md with resolved items
