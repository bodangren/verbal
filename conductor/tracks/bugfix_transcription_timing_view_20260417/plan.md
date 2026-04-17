# Plan: Transcription Result Usability and Persistence

**Status:** COMPLETE  
**Created:** 2026-04-17  
**Started:** 2026-04-17  
**Completed:** 2026-04-17  
**Focus:** Make completed transcription timing data discoverable, keep the playback window usable on laptop screens, and reload saved transcription results.

---

## Phase 1: Diagnose

- [x] Inspect completed transcription UI stack wiring.
- [x] Confirm expected word-level timing data is present in `ai.TranscriptionResult.Words`.
- [x] Identify why manual UI shows only the editable text field.
- [x] Inspect playback window sizing defaults.
- [x] Inspect transcription save/load metadata paths.

### Findings

- `EditableTranscriptionView.SetResult` fills the text buffer and stores `result.Words`.
- It creates a new `WordContainer` but adds it under stack child name `words-view`.
- The toolbar toggle switches between `text` and `words`, so it targets the old initial word container instead of the populated one.
- The timing toggle is icon-only, which makes the intended timing view difficult to discover.
- Main window defaults to 1200x700 without an explicit resizable setting; the layout also has fixed-size panes that make small laptop screens awkward.
- Successful transcription writes `<video>.meta.json`, but `RecordingLoader` reloads `<video-without-ext>.json` with a legacy schema.

## Phase 2: Patch

- [x] Add focused UI tests for timed-word stack behavior.
- [x] Update `SetResult` to reuse the existing `words` stack child.
- [x] Make the timing toggle label clearer.
- [x] Make main window defaults laptop-friendly and explicitly resizable.
- [x] Load saved `.meta.json` transcription metadata on reopen, with legacy fallback.

### Changes

- The transcription toolbar now has a labeled `Word timings` control instead of an unlabeled icon.
- The timed words view now reuses the existing `words` stack child and is wrapped in a scrolled window so long transcripts do not force the app taller than the screen.
- Sync highlighting and word-click seek now use the same populated word container that the user sees.
- Main window defaults are now 1000x640 and explicitly resizable.
- `RecordingLoader` now loads the same `<video>.meta.json` file written by successful transcription saves, while retaining fallback support for legacy `<video-without-ext>.json` metadata.
- Word data reload now preserves both start and end times.

## Phase 3: Verify

- [x] Run focused UI/load tests.
- [x] Run broader verification.

### Verification

- `go test ./internal/ui ./cmd/verbal -count=1` - pass.
- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.
- `go run ./cmd/verbal --smoke-check` - pass, output `smoke-check:ok`.
- `timeout 10s go run ./cmd/verbal` - app stayed alive until timeout with no warning output.

## Manual Retest

1. Complete a transcription.
2. Confirm the transcript still appears in the editable text field.
3. Use the `Word timings` control.
4. Confirm the word-level view is populated and word tooltips/click targets reflect timestamps.
5. Close and reopen the same file.
6. Confirm the saved transcript and timing data reload.
7. Confirm the window fits on the laptop screen and can be resized.
