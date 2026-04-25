# Plan: MP4 File Open Does Not Load Playback

**Status:** COMPLETE  
**Created:** 2026-04-17  
**Started:** 2026-04-17  
**Completed:** 2026-04-17  
**Focus:** Fix the manual QA blocker where selecting an MP4 in the open file dialog returns but does not load anything into the app.

---

## Phase 1: Trace Open/Load Flow

- [x] Inspect `cmd/verbal/main.go` open dialog wiring.
- [x] Inspect playback window and recording loader APIs.
- [x] Identify why a selected path returns without loading.

### Finding

The file dialog calls `loadRecording(state, path)` but never calls `showPlaybackView(state)`. Library item activation does switch to playback, so the direct open-file path loads work invisibly behind the library view. Playback pipeline paths were also passed into GStreamer without quoting, so valid MP4 paths containing spaces or control characters could fail pipeline parsing.

## Phase 2: Fix and Test

- [x] Add focused coverage for the selected-file load behavior where possible.
- [x] Patch the open/load path.
- [x] Surface errors visibly rather than silently ignoring them.

### Changes

- Added `openRecordingPath` in `cmd/verbal/main.go` so file-dialog opens and library activations both load the selected file and switch to the playback view.
- Added file-dialog nil-file guard before dereferencing the selected file.
- Added a fallback loaded-video placeholder when `gtk4paintablesink` is unavailable, so a successful load is visible even when playback uses external `autovideosink`.
- Quoted/sanitized playback file paths before passing them to GStreamer pipeline parsing.
- Added focused tests for open-file stack switching and playback paths containing spaces.

## Phase 3: Verification

- [x] Run focused tests for touched packages.
- [x] Run `go test ./... -count=1`.
- [x] Run `go build ./...`.
- [x] Run `go run ./cmd/verbal --smoke-check`.
- [x] Run bounded launch if needed.

### Focused Verification

- `go test ./cmd/verbal ./internal/media -count=1` - pass.

### Final Verification

- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.
- `go run ./cmd/verbal --smoke-check` - pass, output `smoke-check:ok`.
- `timeout 10s go run ./cmd/verbal` - app stayed alive until timeout. It printed `Warning: Thumbnail generation failed for recording 1: extract thumbnail frame: failed to seek extraction pipeline`, which is an existing thumbnail-generation warning from the current local library and not the MP4 open/load path.

## Phase 4: Closure

- [x] Update this plan and `measure/tracks.md` with results.
- [x] Report exact manual retest steps.

## Manual Retest Feedback

User confirmed:
- Open file works.
- Playback view opens.
- No-transcription placeholder appears.
- Fallback `Video loaded...` state appears.
- Video plays.

New out-of-scope blocker found: transcription fails with `max retries exceeded`. A separate bugfix track was opened for transcription diagnostics.
