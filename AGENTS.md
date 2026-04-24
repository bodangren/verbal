# AGENTS.md

## Architectural Mandates
- **Language:** Go is the primary language for the entire application.
- **UI Framework:** GTK4 + Libadwaita. Adhere to GNOME Human Interface Guidelines (HIG).
- **Media Engine:** GStreamer. All media capture, playback, and editing MUST use GStreamer pipelines. Direct FFmpeg calls should be avoided unless GStreamer lacks a specific capability.
- **Local-First Media:** All media processing happens locally. Cloud APIs (OpenAI/Google) are ONLY for transcription and LLM-based analysis.
- **Provider Agnostic:** AI features MUST use an abstraction layer. No direct imports of OpenAI/Google SDKs outside the designated AI provider module.
- **Safety:** Sanitize all user-provided strings before passing to GStreamer pipelines or shell commands.
- **Conductor Workflow:** Use the Conductor skill. Always update `conductor/tracks.md` and the current track's `plan.md` before starting work.
- **Performance:** UI updates for transcription/sync MUST be efficient to prevent blocking the GTK main loop. Use Go routines for async tasks.
- **Linux Focus:** Optimize for Ubuntu/GNOME environment. Ensure compatibility with both Wayland and X11.
- **Project Structure:** Maintain a clean Go project structure (e.g., `cmd/`, `internal/`, `pkg/`).

## Build System

Use `make check` for CI validation. Configure GOCACHE for faster incremental builds:
```bash
export GOCACHE=~/.cache/go-build
```

Make targets:
- `make go-build` - Build all packages
- `make go-vet` - Run go vet
- `make go-test` - Run all tests
- `make go-check` - Run vet, build, and tests (optimal for CI)
- `make clean` - Remove artifacts and cache

First build may take >2 minutes due to CGo/GTK4 dependencies. Subsequent builds use cached objects and complete in <10s.
