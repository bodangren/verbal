# Plan: Core Setup - Go + GTK4 + GStreamer

## Objective
Initialize the new Go-based project structure, set up the GTK4/Libadwaita UI environment, and verify basic GStreamer pipeline functionality.

## Phase 1: Go Project Initialization
- [x] Initialize Go module (`go mod init verbal`).
- [x] Create basic project structure.
- [x] Install basic dependencies (`gotk4`, `gotk4-gstreamer`).
- [ ] *Note: Libadwaita skipped due to Go 1.24 requirement.*

## Phase 2: Basic UI Scaffolding
- [x] Create a simple GTK4 window.
- [x] Implement a "Hello World" UI with buttons and a label.
- [x] Ensure the window adheres to basic GNOME styling (even without Adwaita).

## Phase 3: GStreamer Integration
- [x] Implement a basic GStreamer pipeline for testing (`videotestsrc ! autovideosink`).
- [x] Integrate GStreamer's video sink into the GTK window (currently using separate window).
  *Note: Using autovideosink (separate window) due to gtk4paintablesink not being available on this system.
  Future: Install gstreamer1.0-plugins-bad for gtk4paintablesink support.*
- [x] Verify basic playback controls (Start/Stop).

## Phase 4: Recording Scaffolding [x] Completed
- [x] Define a basic recording pipeline for webcam and mic.
- [x] Implement a "Record" button that captures a few seconds of media to a temporary file.

## Phase 5: Verification & Cleanup [x] Completed
- [x] Ensure all Go tests (if any) pass.
- [x] Verify that the application runs and the window displays correctly on Ubuntu/GNOME.
