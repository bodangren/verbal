# Plan: Main Application Foundational Refactor

**Status:** IN PROGRESS  
**Created:** 2026-06-12  
**Started:** 2026-06-12  
**Focus:** Refactor `cmd/verbal/main.go` from a 1,479-line God object into an `internal/app` controller, presenter layer, standardized async contracts, consolidated media pipeline, and cleaner package boundaries using red-green-refactor TDD.

---

## Phase 1: Safety Net — Characterization Tests

### Red
- [ ] Create `cmd/verbal/main_test.go` with a failing test that asserts `runStartupSmoke` can be invoked through a testable helper.
- [ ] Add failing test that the `activate` function wires expected services when given a non-nil database.
- [ ] Add failing test that GTK application actions registered by `setupFileMenu` and `setupToolsMenu` exist by name.

### Green
- [ ] Extract a testable `startupSmokeRunner` and `activationRunner` from `main.go` without changing behavior.
- [ ] Make characterization tests pass against the current code.

### Refactor
- [ ] Document the untestable surface area (direct GTK calls, global state) that will guide the `internal/app` extraction.
- [ ] Commit: `Phase 1: add characterization tests for main.go flows`

---

## Phase 2: Extract `internal/app` Controller

### Red
- [ ] Write failing tests in `internal/app/controller_test.go` constructing `app.NewController(database, config)` and asserting:
  - non-nil controller,
  - all services (recording, thumbnail, settings, AI factory, backup, auto-save) are wired,
  - `Controller.RunSmokeCheck()` returns no error for a valid database.

### Green
- [ ] Create `internal/app/controller.go` with `Controller` struct mirroring current `appState` service fields.
- [ ] Move `initializeDatabase`, `runStartupSmoke`, `loadEnvFiles`, and service construction from `main.go` into the controller.
- [ ] Move `ConnectCloseRequest` cleanup wiring into `Controller.Activate`.
- [ ] Update `main.go` to construct the controller and call `controller.Activate(app)`.

### Refactor
- [ ] Reduce `main.go` to under 200 lines.
- [ ] Remove duplicated service creation between smoke-check path and activate path.
- [ ] Commit: `Phase 2: extract internal/app controller from main.go`

---

## Phase 3: Relocate Adapters and Lifecycle Wiring

### Red
- [ ] Write failing tests in `internal/db` and `internal/lifecycle` verifying that moved adapter types satisfy their consumer interfaces:
  - `db.RecordingService` as `lifecycle.RecordingProvider`,
  - `db.RecordingService` as recording store for import,
  - a file-system writer as `lifecycle.FileWriter`.

### Green
- [ ] Move `recordingProviderAdapter`, `fileProviderAdapter`, `importerRecordingStore`, and `realFileWriter` to `internal/lifecycle/adapters.go` or appropriate package files.
- [ ] Move `uiSyncAdapter`, `playbackSyncAdapter`, and `waveformSyncAdapter` to `internal/sync/adapters.go`.
- [ ] Move `fillerRecordingAdapter` to `internal/filler/adapters.go`.
- [ ] Wire all lifecycle services (archive exporter/importer, database inspector/repairer) inside `Controller` instead of `main.go`.

### Refactor
- [ ] Collapse duplicate narrow interfaces into shared `RecordingReader` / `RecordingWriter` where the shapes overlap.
- [ ] Commit: `Phase 3: relocate adapters and lifecycle wiring into packages`

---

## Phase 4: UI Presenter Layer

### Red
- [ ] Write failing tests in `internal/ui/presenter` for:
  - `PlaybackPresenter.OnOpenFile(path)` delegates to app controller,
  - `ExportPresenter.OnExport(segments, outputPath)` delegates to `media.SegmentExporter`,
  - `LibraryPresenter.OnSearch(query)` delegates to recording service.

### Green
- [ ] Create `internal/ui/presenter/playback.go`, `export.go`, `import.go`, `repair.go`, `filler.go`, `settings.go`, `library.go`.
- [ ] Move dialog orchestration (`showExportDialog`, `showImportDialog`, `showRepairDialog`, `showFillerRemovalDialog`, `showBackupSettingsDialog`, `showSettingsWindow`, `showOpenFileDialog`) from `main.go` into presenters.
- [ ] Update `main.go` to wire presenters and pass them to widgets.

### Refactor
- [ ] Replace `PlaybackWindow` widget getters (`GetPaned`, `GetVideoWidget`, etc.) with intent-based methods:
  - `OnWaveformSeek(handler)`
  - `SetWaveformData(data)`
  - `OnFillerDetect(handler)`
  - `SetLiveCaptionWidget(widget)` without leaking GTK internals.
- [ ] Commit: `Phase 4: add presenter layer and encapsulate PlaybackWindow`

---

## Phase 5: Standardize Async Contracts

### Red
- [ ] Write failing tests in `internal/progress/reporter_test.go` for:
  - `Reporter.Report(percent, message)` stores values,
  - `Reporter.Done(result, err)` returns error if err is non-nil,
  - `Reporter.Fail(err)` records failure.

### Green
- [ ] Create `internal/progress` package with `Reporter` interface and a `SafeReporter` implementation.
- [ ] Add `progress.GTKDispatcher` helper that wraps `glib.IdleAdd`.
- [ ] Refactor `media.SegmentExporter` from `SetProgressHandler/SetCompleteHandler/SetErrorHandler` to `SetReporter`.
- [ ] Refactor `lifecycle` services to use `progress.Reporter`.
- [ ] Refactor `transcription.Service` progress callback to `progress.Reporter`.
- [ ] Refactor `filler.Service` to use `progress.Reporter`.

### Refactor
- [ ] Normalize percent type to `int` everywhere.
- [ ] Remove callback normalization code from presenters.
- [ ] Commit: `Phase 5: standardize progress and error reporting`

---

## Phase 6: Consolidate Media Editing Pipeline

### Red
- [ ] Write failing tests in `internal/media/pipeline/pipeline_test.go` for:
  - single-segment trim with start/end boundaries,
  - multi-segment concat,
  - stream-copy fallback when codecs match,
  - re-encode fallback when codecs differ.

### Green
- [ ] Create `internal/media/pipeline` package with `Builder` and `Operation` types.
- [ ] Move stream-copy/re-encode logic from `media/export.go` and segment logic from `edit/segment_editor.go` into the shared builder.
- [ ] Update `media.SegmentExporter` to delegate to `media/pipeline`.
- [ ] Update `edit.GstSegmentEditor` to delegate to `media/pipeline`.
- [ ] Fix the latent trim bug in `edit.GstSegmentEditor.exportSegment` by applying `startNs`/`endNs` to the pipeline.

### Refactor
- [ ] Remove `media/concat_builder.go` duplicate code.
- [ ] Unify on `gotk4-gstreamer` execution model; wrap `gst-launch-1.0` only if absolutely necessary behind the same interface.
- [ ] Commit: `Phase 6: consolidate GStreamer segment/export pipeline`

---

## Phase 7: Package Reorganization and Testability

### Red
- [ ] Write failing import tests showing that `internal/media/capture`, `media/playback`, and `media/edit` can be imported without triggering CGO side effects.

### Green
- [ ] Split `internal/media`:
  - `media/capture` — `recording.go`, `pipeline.go`, `devices.go`,
  - `media/playback` — `playback.go`, `position_monitor.go`,
  - `media/edit` — `export.go`, `concat_builder.go` (remaining), `timestamp_mapper.go`, `codec.go`, `pipeline/` subpackage,
  - `media` root — `sanitize.go`, shared types/interfaces.
- [ ] Split `internal/ui`:
  - `ui/widgets` — `waveformwidget.go`, `virtualized_word_container.go`, `livecaptionwidget.go`, `thumbnailwidget.go`,
  - `ui/screens` — `libraryview.go`, `playbackwindow.go`,
  - `ui/dialogs` — `exportdialog.go`, `importdialog.go`, `repairdialog.go`, `fillerremovaldialog.go`, `settingswindow.go`, `backupsettingsdialog.go`, `recoverydialog.go`,
  - `ui` root — `styling.go`, `recordingloader.go`, `editabletranscriptionview.go`, `recordinglistitem.go`, shared helpers.
- [ ] Remove or relocate package-level `init()` functions in `media/pipeline.go`, `waveform/generator.go`, `thumbnail/gstreamer_extractor.go` to explicit constructors.

### Refactor
- [ ] Update all imports across the codebase.
- [ ] Expand fake pipeline and codec detector patterns for headless tests.
- [ ] Commit: `Phase 7: split media/ui packages and remove init side effects`

---

## Phase 8: Polish and Final Verification

### Red
- [ ] Write failing `-race` tests in `ui/widgets` for `VirtualizedWordContainer` concurrent scroll/highlight.
- [ ] Write failing test in `internal/db` asserting a `schema_migrations` table exists and tracks version rows.

### Green
- [ ] Encapsulate `VirtualizedWordContainer` pool-index mapping in a `ViewportModel` type.
- [ ] Add `internal/db/migrations.go` with versioned migration runner and `schema_migrations` table.
- [ ] Convert existing ad-hoc column helpers to idempotent migrations.
- [ ] Replace remaining `PlaybackWindow` widget getters with intent methods.

### Refactor
- [ ] Run `make go-check` and fix any vet/build/test failures.
- [ ] Run smoke check and bounded GTK launch.
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md`.
- [ ] Update this `plan.md` and `measure/tracks.md` with completion status.
- [ ] Commit: `Phase 8: polish, migrations, race tests, and memory files`

---

## Quality Gates

After each phase:
- [ ] `go test ./...` passes for affected packages.
- [ ] `go build ./...` passes.
- [ ] `go vet ./...` passes.
- [ ] `go run ./cmd/verbal --smoke-check` passes.

Final gate:
- [ ] Full `make go-check` passes.
- [ ] Manual QA checklist (open, transcribe, export, filler removal, backup, auto-save recovery) is re-run.
