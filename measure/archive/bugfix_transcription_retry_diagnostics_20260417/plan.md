# Plan: Transcription Max Retries Diagnostic Failure

**Status:** COMPLETE  
**Created:** 2026-04-17  
**Started:** 2026-04-17  
**Completed:** 2026-04-17  
**Focus:** Fix transcription failures surfacing only as generic `max retries exceeded`, and make provider/network/API failures diagnosable from the UI and metadata.

---

## Phase 1: Diagnose Error Path

- [x] Inspect OpenAI and Google provider retry loops.
- [x] Inspect UI transcription error rendering.
- [x] Inspect transcription metadata persistence for failed attempts.

### Additional Manual QA Logs

The same manual run also surfaced non-transcription warnings:

- `Warning: Thumbnail generation failed for recording 1: extract thumbnail frame: failed to seek extraction pipeline`
- `WARN Tried to remove non-child ... gtk_list_box_remove`

These are being inspected alongside the transcription diagnostics because they affect manual QA signal quality, but they are separate from the provider retry failure.

### Findings

- OpenAI and Google provider retry exhaustion only returned `max retries exceeded: <last error>` for request send/read failures. The wrapped cause was present, but the top-level message did not identify the provider or number of attempts.
- UI error rendering and saved metadata use `err.Error()`, so improving provider/service errors directly improves both visible and persisted diagnostics.
- `LibraryView.SetRecordings` removed cached item widgets one by one; GTK can warn when a stale widget is no longer a direct list child.
- Thumbnail extraction failed permanently when the 1-second seek failed, even though extracting frame 0 is an acceptable fallback.

## Phase 2: Patch Diagnostics

- [x] Add focused tests for retry exhaustion preserving the underlying cause.
- [x] Patch provider retry exhaustion messages.
- [x] Patch transcription service/UI error wrapping if needed.

### Changes

- OpenAI retry exhaustion now reports `OpenAI request failed after N attempt(s): <underlying cause>`.
- Google retry exhaustion now reports `Google request failed after N attempt(s): <underlying cause>`.
- Thumbnail generation falls back to frame 0 if seeking to the target thumbnail offset fails.
- Library refresh now uses `gtk.ListBox.RemoveAll()` to avoid stale-child remove warnings.

## Phase 3: Verification

- [x] Run focused AI/transcription tests.
- [x] Run `go test ./... -count=1`.
- [x] Run `go build ./...`.
- [x] Run `go run ./cmd/verbal --smoke-check`.

### Focused Verification

- `go test ./internal/ai ./internal/thumbnail ./internal/ui -count=1` - pass.

### Final Verification

- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.
- `go run ./cmd/verbal --smoke-check` - pass, output `smoke-check:ok`.
- `timeout 10s go run ./cmd/verbal` - app stayed alive until timeout with no warning output. The prior thumbnail seek warning and GTK list-box warning did not recur during this bounded launch.

## Phase 4: Closure

- [x] Update this plan and `measure/tracks.md` with results.
- [x] Report exact manual retest steps and how to interpret the next error.

## Manual Retest

1. Run `go run ./cmd/verbal`.
2. Open and play the same MP4.
3. Run transcription again.
4. If the provider request still fails, the UI and `.meta.json` should now show a provider-specific message like `OpenAI request failed after 4 attempt(s): send request: ...` or `Google request failed after 4 attempt(s): send request: ...`.
5. Use that underlying cause to distinguish network/provider reachability, auth, rate limit, or server availability.

## Reopened: Error Readability and Provider Timeout

Manual retest showed the improved error still runs off-screen and cannot be selected/copied. The visible portion indicates `failed after 4 attempt(s): context deadline exceeded (Client.Timeout exceeded while ...)`, which also shows the default HTTP timeout is too short for this real transcription request.

### Follow-up Tasks

- [x] Put full transcription errors in the scrollable text area and make them selectable/copyable.
- [x] Wrap status/error labels so titles cannot run off-screen.
- [x] Increase provider HTTP timeouts for real audio transcription uploads.
- [x] Add focused tests and rerun verification.

### Follow-up Changes

- `EditableTranscriptionView.SetError` now sets the title to `Transcription Error` and puts the full error string into the scrollable text buffer.
- `TranscriptionView.SetError` follows the same pattern for the older view.
- Error/title labels are wrapped and selectable.
- Default OpenAI and Google HTTP client timeouts increased from 30 seconds to 5 minutes for real transcription uploads.
- Added focused AI timeout and UI copyable-error tests.

### Follow-up Focused Verification

- `go test ./internal/ai ./internal/ui -count=1` - pass.

### Follow-up Final Verification

- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.
- `go run ./cmd/verbal --smoke-check` - pass, output `smoke-check:ok`.
- `timeout 10s go run ./cmd/verbal` - app stayed alive until timeout with no warning output.

### Updated Manual Retest

1. Run `go run ./cmd/verbal`.
2. Open the same MP4.
3. Run transcription.
4. If transcription still fails, the title should read `Transcription Error`.
5. The full error should appear in the scrollable text area below the title. Select/copy that text from the text area.
6. The provider request timeout is now 5 minutes, so a repeated timeout after this change is a real long-running provider/network/API issue rather than the previous 30-second client timeout.

## Reopened: OpenAI 500 Empty Body

Manual retest now reaches OpenAI, but the final surfaced error is `transcription failed: OpenAI server error (500):` with no response body after the colon. OpenAI status is currently operational, so the app needs to preserve request-level diagnostic context for provider-side failures.

### Follow-up Tasks

- [x] Include a readable placeholder when provider error responses have empty bodies.
- [x] Preserve provider request IDs when available.
- [x] Keep final retry exhaustion context for retryable HTTP failures.
- [x] Add focused tests and rerun verification.

### Follow-up Changes

- Empty provider error bodies now render as `empty response body` instead of a blank trailing colon.
- Classified provider errors now carry `request_id=...` when the HTTP response includes `x-request-id`.
- Final retryable HTTP failures now keep the provider retry wrapper, for example `OpenAI request failed after 4 attempt(s): OpenAI server error (500, request_id=...): empty response body`.
- OpenAI uploads now send only the media basename as the multipart filename, avoiding local path leakage while preserving the file content.

### Follow-up Verification

- `go test ./internal/ai -count=1` - pass.
- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.
- `go run ./cmd/verbal --smoke-check` - pass, output `smoke-check:ok`.
- `timeout 10s go run ./cmd/verbal` - app stayed alive until timeout with no warning output.

### Final Manual Retest

1. Run `go run ./cmd/verbal`.
2. Open the same MP4.
3. Run transcription.
4. If OpenAI returns the same 500, the copyable text area should now include attempt count, `empty response body`, and `request_id=...` if OpenAI provided one.
5. If the request ID appears, keep that full copied error for provider support or further diagnosis. If no request ID appears and the 500 repeats, switch provider or retry later because the request has reached OpenAI and failed server-side.

## Reopened: OpenAI 500 Persists Without Request ID

Manual retest still returns `OpenAI request failed after 4 attempt(s): OpenAI server error (500): empty response body` with no request ID. OpenAI documentation states the Audio API upload limit is 25 MB, and the current service extracts MP4 input to uncompressed WAV before upload. That can inflate the request enough to trigger provider-side failures.

### Follow-up Tasks

- [x] Replace FFmpeg transcription audio extraction with GStreamer extraction.
- [x] Use compressed FLAC extraction for OpenAI uploads to reduce request size.
- [x] Add a local OpenAI upload size preflight before network calls.
- [x] Add focused tests and rerun verification.

### Follow-up Changes

- Transcription audio extraction now uses `gst-launch-1.0` instead of FFmpeg.
- OpenAI video transcription extracts to 16 kHz mono FLAC instead of uncompressed WAV.
- Google and custom providers keep 16 kHz mono WAV extraction.
- OpenAI uploads now fail locally before the network call if the audio file exceeds the documented 25 MB Audio API limit.
- Extraction writes to a unique temp file and removes it after transcription.

### Follow-up Verification

- `go test ./internal/ai ./internal/transcription -count=1` - pass.
- Live GStreamer extraction check - pass; FLAC output was smaller than equivalent WAV output.
- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.
- `go run ./cmd/verbal --smoke-check` - pass, output `smoke-check:ok`.
- `timeout 10s go run ./cmd/verbal` - exited cleanly with no warning output in this run.

### Updated Manual Retest

1. Run `go run ./cmd/verbal`.
2. Open the same MP4.
3. Run transcription again.
4. The progress text should mention extracting `compressed FLAC` audio before sending to OpenAI.
5. If the extracted audio is still over 25 MB, the app should fail locally with a clear `exceeds OpenAI Audio API 25 MB limit` message instead of spending four provider retries.
6. If OpenAI still returns 500 after this change, the request is smaller and correctly shaped; switch provider or retry later, and keep the full copyable error text.
