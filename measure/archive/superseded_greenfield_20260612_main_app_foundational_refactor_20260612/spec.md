# Specification: Main Application Foundational Refactor

## Overview

`cmd/verbal/main.go` has grown into a 1,479-line God object. It currently initializes the database, constructs every service, wires GTK menus and dialogs, manages backup/export/import/repair/filler workflows, toggles real-time transcription, handles auto-save lifecycle, and defines multiple cross-package adapter types inline. This track extracts a proper application architecture from that file while preserving all existing behavior.

## Goals

1. Extract an `internal/app` controller / service-locator that owns dependency construction and cross-feature orchestration.
2. Move inline adapters from `main.go` into the packages that define the consumer interfaces.
3. Introduce a presenter/controller layer between `main.go` / `internal/app` and `internal/ui` so widgets emit intents instead of exposing GTK internals.
4. Consolidate duplicated GStreamer segment/export logic across `internal/edit`, `internal/media/export.go`, and `internal/media/concat_builder.go`.
5. Standardize progress and error callback contracts across `media`, `lifecycle`, `transcription`, and `filler` packages.
6. Split `internal/media` and `internal/ui` into smaller, responsibility-focused subpackages.
7. Remove package-level `init()` side effects that force CGO bindings to load during headless test runs.
8. Fix remaining workaround complexity in `VirtualizedWordContainer` pool-index mapping.
9. Add a versioned SQLite migration table instead of ad-hoc column-backfill helpers.
10. Hide `PlaybackWindow` widget references behind intent-based methods.

## Non-Goals

- Rewriting UI widgets from scratch (widgets are reused and only restructured into subpackages).
- Changing AI provider implementations or transcription algorithms.
- Changing the database schema beyond adding a migration table and required columns.
- Adding new user-facing features (this is a structural refactor).

## Functional Requirements

### FR1: Application Controller
- `internal/app` must provide a `Controller` type that can be constructed with a database instance and optional configuration.
- The controller must expose lifecycle methods: `Initialize`, `Activate`, `Shutdown`, `RunSmokeCheck`.
- `main.go` must be reduced to flag parsing, controller construction, and `app.Run` invocation.

### FR2: Adapter Relocation
- All adapter types currently defined in `main.go` (`uiSyncAdapter`, `playbackSyncAdapter`, `waveformSyncAdapter`, `recordingProviderAdapter`, `fileProviderAdapter`, `importerRecordingStore`, `realFileWriter`, `fillerRecordingAdapter`) must move to the package that owns the consumer interface.
- Duplicated narrow interfaces should collapse into shared abstractions such as `RecordingReader` / `RecordingWriter` where feasible.

### FR3: UI Presenter Layer
- `internal/ui/presenter` must provide presenters for `Playback`, `Export`, `Import`, `Repair`, `FillerRemoval`, `Settings`, and `Library`.
- Presenters receive user intents from widgets and delegate to application services.
- `PlaybackWindow` must no longer leak internal GTK widget references via getters.

### FR4: Consolidated Media Pipeline
- A single shared package (tentatively `internal/media/pipeline`) must own time-range extraction, multi-segment concatenation, and codec-aware stream-copy fallback.
- `media.SegmentExporter` and `edit.GstSegmentEditor` must both delegate to this shared pipeline.
- The latent bug in `edit.GstSegmentEditor.exportSegment` where `startNs`/`endNs` are computed but ignored must be fixed.

### FR5: Standardized Async Contracts
- `internal/progress` must define a `Reporter` interface with `Report(percent int, message string)` and `Done(result, error)` / `Fail(error)` semantics.
- `media.SegmentExporter`, `lifecycle` import/export/repair services, `transcription.Service`, and `filler.Service` must adopt the new contract.
- A GTK-safe dispatcher helper must route progress updates to the main thread.

### FR6: Package Reorganization
- `internal/media` must split into:
  - `media/capture` — recording and device enumeration,
  - `media/playback` — playback pipeline and position monitor,
  - `media/edit` (or `media/export`) — segment editing, export, concat, codec detection,
  - `media` root — shared types, interfaces, and `sanitize.go`.
- `internal/ui` must split into:
  - `ui/widgets` — reusable widgets (waveform, word container, live caption),
  - `ui/screens` — full-screen coordinators (library, playback),
  - `ui/dialogs` — dialog windows (export, import, repair, filler, settings, backup, recovery),
  - `ui` root — shared styling and helpers.

### FR7: Testability Improvements
- Package-level `init()` functions that register GStreamer/GTK types must be removed or relocated to explicit constructors.
- It must be possible to import `internal/media/...` and `internal/waveform/...` subpackages in headless tests without loading CGO bindings.
- Existing mock/fake patterns in `media/export_test.go` and `media/codec_test.go` must be expanded.

### FR8: VirtualizedWordContainer Cleanup
- Pool-index mapping must be encapsulated in a `ViewportModel` so callers do not reason about `attachedCount` or pool slot math.
- `-race` tests must be added for concurrent scroll and highlight updates.

### FR9: Versioned Database Migrations
- A `schema_migrations` table must track applied migration versions.
- Existing ad-hoc `addSettingsColumnIfMissing` / `addRecordingColumnIfMissing` helpers must be replaced by versioned migrations during the transition, or made idempotent fallbacks.

### FR10: PlaybackWindow Encapsulation
- `PlaybackWindow` must expose intent-based methods (e.g., `OnWaveformSeek`, `SetWaveformData`, `OnFillerDetect`) instead of GTK widget getters.

## Acceptance Criteria

- [ ] `main.go` is under 200 lines and contains no business logic beyond parsing flags, constructing the app controller, and running the GTK application.
- [ ] `internal/app.Controller` has unit tests covering construction, service wiring, and lifecycle methods without requiring a display.
- [ ] All inline adapters from `main.go` are relocated and have unit tests verifying interface satisfaction.
- [ ] Presenter layer has unit tests verifying intent-to-service delegation.
- [ ] Shared media pipeline has tests for single-segment trim, multi-segment concat, and stream-copy fallback.
- [ ] `edit.GstSegmentEditor.exportSegment` correctly applies start/end time boundaries.
- [ ] All existing tests continue to pass; no regressions in smoke check or manual QA checklist.
- [ ] `go test ./...`, `go build ./...`, and `go vet ./...` pass.
- [ ] `measure/tech-debt.md` and `measure/lessons-learned.md` are updated with new patterns.
- [ ] Each phase is committed atomically with a descriptive message.
