# Chore: Refactor/Cleanup 2026-03-28

## Track Type: chore
## Started: 2026-03-28

## Problem
1. **High-severity regression:** `cmd/verbal/main.go` does not wire the transcription workflow. The `internal/ui/transcriptionview.go`, `internal/transcription/service.go`, `internal/transcription/metadata.go`, and `internal/ai/provider.go` packages exist but are orphaned — nothing in `main.go` creates a transcription service or displays the TranscriptionView.
2. **Zero test coverage:** No `_test.go` files exist anywhere in the project.
3. AI provider `Transcribe()` methods are stubbed (return errors), which is by design per the REST API pattern, but should have tests for the stub behavior.

## Phases

### Phase 1: Wire Transcription into Main UI [status: completed]
- Add transcription service initialization to `activate()` in `main.go`
- Add "Transcribe" button next to existing buttons
- Connect TranscriptionView to the main layout
- Load CSS via `ui.LoadApplicationCSS()`
- Wire progress callback to update TranscriptionView status
- On transcribe click: create metadata, call service, display result, save metadata
- Test: manual verification of the complete flow

### Phase 2: Add Unit Tests [status: completed]
- Test `internal/ai/provider.go`: factory function, interface compliance, stub responses
- Test `internal/transcription/metadata.go`: create, save, load, set transcription/error
- Test `internal/transcription/service.go`: progress callbacks, error wrapping
- Test `internal/media/types.go`: state string conversion
- Test `internal/media/devices.go`: parseWpctlSources, device detection helpers

## Success Criteria
- `go build ./...` succeeds
- `go test ./...` passes (excluding GTK-dependent tests when no display)
- `main.go` shows a working transcribe button that calls the transcription service
- Tech debt item for transcription regression is resolved
