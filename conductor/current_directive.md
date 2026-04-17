# Current Directive: Transcription Result Usability and Persistence

## Status: COMPLETE

**Track:** Bugfix - Transcription Result Usability and Persistence  
**Started:** 2026-04-17  
**Completed:** 2026-04-17  
**Focus:** Make completed transcription timing data discoverable, keep the playback window usable on laptop screens, and reload saved transcription results.

---

## Summary

Manual QA confirmed transcription now completes and text appears, but timings are not clear. The window can be taller than the laptop screen and effectively not resizable. Completed transcriptions also disappear after close/reopen.

Code inspection shows `EditableTranscriptionView.SetResult` populates a new stack child named `words-view`, while the toolbar toggles the existing child named `words`, leaving the actual timed words hard to discover or unreachable. The persistence bug is a path/schema mismatch: save writes `<video>.meta.json`, while reload reads `<video-without-ext>.json`.

## Resolution

- Added focused UI/load tests for timing view and metadata reload behavior.
- Wired completed transcription words into the stack child that the toolbar uses.
- Replaced the unlabeled icon timing control with `Word timings`.
- Wrapped the timed words view in a scroller so long transcripts do not force excessive window height.
- Main window defaults to 1000x640 and is explicitly resizable.
- `RecordingLoader` now loads saved `<video>.meta.json` transcription metadata, with legacy `<video-without-ext>.json` fallback.

## Verification

- `go test ./internal/ui ./cmd/verbal -count=1` - pass.
- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.
- `go run ./cmd/verbal --smoke-check` - pass.
- `timeout 10s go run ./cmd/verbal` - stayed alive until timeout with no warning output.

## Manual Retest

Complete a transcription, use `Word timings`, close and reopen the same file, and confirm the transcript plus timing data reload. The window should fit better on a laptop and be resizable.
