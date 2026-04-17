# Plan: Manual Test Readiness and Project Status Audit

**Status:** COMPLETE  
**Created:** 2026-04-17  
**Started:** 2026-04-17  
**Completed:** 2026-04-17  
**Focus:** Reconcile current project status, run automated verification, and produce a manual QA checklist for the Linux/GNOME app surface.

---

## Phase 1: Conductor Status Reconciliation

- [x] Read routing artifacts: `index.md`, `tracks.md`, `current_directive.md`, product definition, tech stack, workflow, lessons learned, and tech debt.
- [x] Summarize completed work, active work, future roadmap, and residual risks.

## Phase 2: Automated Verification

- [x] Run full Go test suite.
- [x] Run full Go build.
- [x] Run non-interactive startup smoke check.
- [x] Record command outcomes and blockers.

### Initial Test Findings

- `go test ./... -count=1` failed in `internal/ui`: `RepairDialog.SetRepairReport` calls `SetRepairingState(false)` while `inspectionReport` is nil.
- `go test ./... -count=1` failed in `internal/waveform`: GStreamer extraction command passed the full pipeline as one `gst-launch-1.0` argument, so no output raw file was created.
- Manual-readiness GStreamer probe found `voaacenc` unavailable on this Ubuntu/GStreamer install while `avenc_aac` is available and works in a test MP4 mux pipeline.
- Bounded live GTK launch initially emitted a CSS parser warning for unsupported `overflow`; removed the unsupported rule.

### Fixes Applied During Verification

- `internal/ui/repairdialog.go`: `SetRepairingState` now handles a nil inspection report and only enables repair controls when report data supports them.
- `internal/waveform/gstreamer_extractor.go`: `gst-launch-1.0` extraction now passes pipeline tokens as separate argv entries instead of one full pipeline string.
- `internal/waveform/generator.go`: added `sanitizeLocationArg` for direct GStreamer argv location values while preserving `quoteLocation` for parsed pipeline strings.
- `internal/media/recording.go` and `internal/media/export.go`: replaced unavailable `voaacenc` with installed `avenc_aac`.
- `internal/ui/styling.go`: removed unsupported GTK CSS `overflow` property.

### Final Verification Results

- `go test ./... -count=1` - pass.
- `go build ./...` - pass.
- `go vet ./...` - pass.
- `go run ./cmd/verbal --smoke-check` - pass, output `smoke-check:ok`.
- `timeout 10s go run ./cmd/verbal` - pass for readiness; app stayed alive until timeout with no warning output after CSS cleanup.

### Local Dependency Probe

- Present: `gst-launch-1.0`, `v4l2src`, `pulsesrc`, `autoaudiosrc`, `autovideosink`, `x264enc`, `avenc_aac`, `mp4mux`, `matroskamux`.
- Missing: `gtk4paintablesink`. Embedded GTK4 video preview will use fallback behavior until that plugin is installed.
- Missing and no longer referenced by current code: `voaacenc`.

## Phase 3: Manual QA Plan

- [x] Produce setup checklist for Linux/GNOME, GStreamer, display, sample media, and optional AI provider keys.
- [x] Produce workflow checklist for startup, recording, library, playback, waveform, thumbnails, transcription, editing/export, import/export, repair, backup, settings, and shutdown.
- [x] Mark which checks need hardware, display, media samples, or credentials.

### Manual QA Checklist

Run from the repository root:

```bash
go run ./cmd/verbal
```

1. Startup and shell integration
   - Expected: main window opens without terminal warnings.
   - Expected: app can be closed cleanly without hanging.

2. Settings and provider configuration
   - Open settings/preferences.
   - Select OpenAI and Google provider options.
   - Enter placeholder keys, save, reopen settings, and confirm values persist or are masked as intended.
   - Credentials needed only for live transcription.

3. Recording workflow
   - Requires webcam/microphone access.
   - Start a short recording, speak a few words, stop recording.
   - Expected: a media file is created, library updates, and no GStreamer encoder errors appear.

4. Library workflow
   - Confirm the new recording appears in the library with file path/duration/status metadata.
   - Use search by path or transcript text where data exists.
   - Temporarily move a recording file outside the app and confirm unavailable-file styling appears after reload.

5. Playback and sync
   - Open a recording from the library.
   - Play, pause, seek with the slider, and click words if transcript data exists.
   - Expected: playback responds promptly and word highlighting follows position updates.
   - If `gtk4paintablesink` remains missing, expect fallback external video behavior rather than embedded preview.

6. Waveform and thumbnail generation
   - Open a recording with audio.
   - Expected: waveform data is generated from real audio and cached.
   - Expected: thumbnail generation completes or reports a user-visible error.

7. Transcription
   - Requires a configured OpenAI or Google key.
   - Run transcription on a short recording.
   - Expected: progress updates do not freeze the GTK UI, transcript text appears, and database status moves to completed or error with a readable message.

8. Edit and export
   - Select or remove transcript segments where supported.
   - Export a short result.
   - Expected: export file is created and playable; terminal should not report missing `voaacenc`.

9. Import/export lifecycle
   - Export one recording archive.
   - Import it into a clean or alternate library state.
   - Expected: manifest checks pass, duplicate handling works, and media/transcript/thumbnail data is restored.

10. Repair tool
    - Open the repair dialog.
    - Run scan.
    - Expected: no crash when repair results are displayed; repair controls are enabled only when repairable issues exist.

11. Backup settings
    - Open backup settings with `Ctrl+Shift+B`.
    - Trigger a manual backup.
    - Enable scheduler, adjust frequency/retention, save, reopen, and confirm settings persist.
    - Expected: backup files use restricted permissions and scheduler callbacks do not crash the app.

12. Shutdown cleanup
    - Close the app after background operations.
    - Expected: no hanging process and no scheduler goroutine panic.

## Phase 4: Closure

- [x] Update this plan and `conductor/tracks.md` with verification results.
- [x] Report complete project update and manual test instructions to the user.
