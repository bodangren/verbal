# Specification: MVP Library & Export

## Overview

This track implements the recording library view and basic export of the original media file.

## Goals

1. List recordings in a library view.
2. Show title, duration, creation date, and transcription status.
3. Allow deleting a recording.
4. Export the original media file unchanged.

## Non-Goals

- Thumbnails (post-MVP).
- Search/filter (post-MVP).
- Edited export with cuts (handled in the Text-Driven Delete track).

## Functional Requirements

### FR1: Library View
- `internal/ui` provides a `LibraryView` widget.
- Lists recordings from SQLite via the app controller.
- Selecting a recording opens it in the playback view.
- Delete button removes the recording entry and optionally the media file.

### FR2: Recording Metadata
- Title defaults to timestamp; user can edit it later (optional for MVP).
- Duration is stored in milliseconds.
- Status badge reflects `New`, `Transcribing`, `Transcribed`, or `Error`.

### FR3: Export Original
- "Export" action copies the original media file to a user-selected path.
- Progress is reported via a simple callback.
- Errors are surfaced in a dialog.

### FR4: Project Storage
- Project directory structure is created on first run.
- Media files live under `projectDir/recordings/`.
- Database lives at `projectDir/verbal.db`.

## Acceptance Criteria

- [x] Library view renders recordings from a mocked repository.
- [x] Delete removes the recording from the repository.
- [x] Export copies the source file to the chosen destination.
- [x] Progress and error states are handled.
- [x] `make check` passes.

**Verification (2026-06-14, Phase 6):**

All five acceptance criteria are satisfied at HEAD
(`f1333a6` + Phase 6 closeout commit). Evidence:

- AC1 — `TestLibraryView_SetRecordings` +
  `TestLibraryView_SetRecordings_ReplacesExistingRows` +
  `TestLibraryView_SetRecordings_Empty` in
  `internal/ui/libraryview_test.go` (Phase 2).
- AC2 — `TestRecordingRepository_Delete` in
  `internal/db/repository_test.go` (Phase 1) +
  `TestController_DeleteRecording_RoutesToDeleter` +
  `TestController_DeleteRecording_RemoveMediaFileTrue_RemovesBoth` +
  `TestController_DeleteRecording_RemoveMediaFileFalse_LeavesFile`
  in `internal/app/controller_export_test.go` (Phase 4).
- AC3 — `TestExporter_HappyPath_CopiesFile` in
  `internal/media/exporter_test.go` (Phase 3) +
  `TestSmoke_ControllerExportLive` in
  `internal/app/controller_export_test.go` (Phase 4, real
  `*media.Exporter` against a 1 KiB tempfile, no fake).
- AC4 — `TestExporter_ProgressMonotonic` +
  `TestExporter_SourceMissing_ReturnsError` +
  `TestExporter_DestUnwritable_ReturnsError` +
  `TestExporter_ContextCanceledMidCopy_ReturnsError` (Phase 3)
  + `TestController_ExportRecording_PropagatesExporterError`
  (Phase 4).
- AC5 — `make check` (Phase 6) reports 18/18 packages green:
  `cmd/verbal`, `internal/ai`, `internal/ai/local`,
  `internal/ai/realtime`, `internal/app`, `internal/db`,
  `internal/domain`, `internal/edit`, `internal/filler`,
  `internal/lifecycle`, `internal/media`, `internal/settings`,
  `internal/sync`, `internal/thumbnail`,
  `internal/transcription`, `internal/transcription/batch`,
  `internal/ui`, `internal/waveform`.

**Verification update (2026-06-14, adversarial Phase 6):**

FR2 status vocabulary is now mapped explicitly in
`internal/ui/recordinglistitem.go:286-299`: `pending` → `New`,
`in_progress` → `Transcribing`, `completed` → `Transcribed`,
`error` → `Error`. Covered by
`TestRecordingListItem_FormatStatus_MatchesSpecVocabulary` in
`internal/ui/libraryview_test.go`.
