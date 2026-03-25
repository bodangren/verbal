# Technology Stack: Verbal

## Core Architecture
- **Language:** Go
- **UI Framework:** GTK4 + Libadwaita (via `gotk4` bindings)
- **Media Engine:** GStreamer (via `gotk4-gstreamer` or custom bindings)
- **Platform:** Native Linux (GNOME/Ubuntu focus)

## UI Layer (GTK)
- **Editor:** GTK TextView or custom structured buffer for transcript editing.
- **Timeline:** Custom GTK DrawingArea or composite widget for visual timeline representation.
- **Preview:** GStreamer video sink integrated into GTK window (e.g., `gtksink`).
- **Design:** Libadwaita for modern, GNOME-native aesthetics (Dark mode focus).

## Backend & Media Processing
- **Recording:** 
    - Webcam: `v4l2src` (Video4Linux2)
    - Audio: `pulsesrc` / `pipewiresrc` (PulseAudio / PipeWire)
- **Playback:** GStreamer `playbin` or custom pipeline for frame-accurate seeking and text-synced cursor updates.
- **Transcoding & Export:** GStreamer `encodebin` using:
    - Video: H.264 (`x264enc`) or VP9 (`vp9enc`)
    - Audio: WAV or AAC
    - Optimization: Stream-copy (`copy` muxing) where possible for fast, lossless cuts.
- **Storage:** 
    - Database: SQLite (via `modernc.org/sqlite` or `mattn/go-sqlite3`) for project and media metadata.
    - File System: Local project structure for storing transcripts (JSON) and original/edited media files.

## AI Integration Layer
- **Providers:** 
    - OpenAI (Whisper API)
    - Google (Speech-to-Text)
- **Architecture:** Go-based async job system for handling cloud API requests and processing responses into word-level timestamped objects.

## Non-Functional Requirements
- **Display Server:** Wayland (primary) + X11 (compatibility).
- **Concurrency:** Go routines for non-blocking media processing and UI events.
- **Latency:** Seek response < 100ms.
