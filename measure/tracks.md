# Project Tracks

This file tracks all major tracks for the Verbal greenfield rewrite. Each track has its own detailed plan in its respective folder.

Active tracks implement the MVP defined in [product.md](./product.md). Roadmap tracks implement post-MVP features.

---

> ⚠️ **Backlog/codebase integrity flag (raised 2026-06-21, needs human decision).** This file presents a clean-slate "greenfield rewrite" where the MVP tracks are *Planned* and roadmap features come *after* MVP. The codebase does not match that narrative: the repo carries the **full pre-rewrite implementation** tracked at HEAD, predating the 2026-06-13 greenfield setup — e.g. `internal/ui/waveformwidget.go` (2026-04-08), `internal/ui/livecaptionwidget.go` (2026-05-07), `internal/ui/editabletranscriptionview.go` (2026-04-05), `internal/ui/importdialog.go` (2026-04-11), `internal/transcription/service.go` (2026-03-26) — covering Recording/Import, Transcription, Text-Delete, and the *Waveform*, *Live-caption/Real-time*, and *Batch-queue* **roadmap** features. The greenfield setup re-architected the domain/schema/controller layer in-place but did not delete this prior art. Net effect: several "Planned" MVP/roadmap tracks have substantial salvageable implementations that are either orphaned (need rewrite-to-new-architecture or deletion) or partially live. **A reconcile-or-delete pass is owed before these statuses can be trusted** — file existence ≠ track complete, so the tracks below are left as-is pending that decision rather than auto-promoted.

## Active Tracks

- [x] **Track: Greenfield Project Setup** [created: 2026-06-12] [completed: 2026-06-12]
  *Focus: Scaffold the new project structure, domain model, SQLite schema with versioned migrations, app controller, and CI checks.*
  *Status: Complete. All acceptance criteria passed; `make check` and smoke check verified.*
  *Link: [./archive/greenfield_project_setup_20260612](./archive/greenfield_project_setup_20260612/)*

- [ ] **Track: MVP Recording & Import** [created: 2026-06-12]
  *Focus: Record video/audio from V4L2/PipeWire and import existing media files into the library.*
  *Status: Planned.*
  *Link: [./tracks/mvp_recording_import_20260612](./tracks/mvp_recording_import_20260612/)*

- [ ] **Track: MVP Transcription** [created: 2026-06-12]
  *Focus: Provider-agnostic transcription interface with OpenAI Whisper and Google Speech-to-Text implementations; word-level timestamp storage.*
  *Status: Planned.*
  *Link: [./tracks/mvp_transcription_20260612](./tracks/mvp_transcription_20260612/)*

- [~] **Track: MVP Playback & Sync** [created: 2026-06-12]
  *Focus: Embedded GStreamer playback, clickable transcript, and current-word highlighting.*
  *Status: In progress — 21/36 plan tasks done, 2 in progress. GStreamer player implemented (`2c7fc9a`), Phase 2 state-machine transition tests green (`ebb6fae`, `fe771b1`), Phase 3 TranscriptView widget complete (`a42ac38`, `67195df`). Remaining: current-word sync/highlighting and Phase 4 acceptance.*
  *Link: [./tracks/mvp_playback_sync_20260612](./tracks/mvp_playback_sync_20260612/)*

- [ ] **Track: MVP Text-Driven Delete** [created: 2026-06-12]
  *Focus: Delete a single word from the transcript and export a new media file with that segment removed.*
  *Status: Planned.*
  *Link: [./tracks/mvp_text_delete_20260612](./tracks/mvp_text_delete_20260612/)*

---

## Roadmap

The following tracks are intentionally outside the MVP. They will be created after the MVP is complete and manually verified.

- [ ] **Track: Multi-Range Delete & Reorder**
  *Delete sentences, reorder paragraphs, insert silence, and split segments.*

- [ ] **Track: Undo/Redo System**
  *Full history stack for text-driven editing operations with Ctrl+Z / Ctrl+Y.*

- [ ] **Track: Waveform & Timeline Visualization**
  *Audio waveform and segment timeline below the transcript.*

- [ ] **Track: Filler Word Detection & Removal**
  *Highlight and remove filler words and repetitions.*

- [ ] **Track: Transcript Search & Navigation**
  *Search within transcripts with highlighted matches and keyboard navigation.*

- [ ] **Track: Batch Transcription Queue**
  *Queue multiple media files for sequential background transcription.*

- [ ] **Track: Export Presets & Profiles**
  *Named export presets for YouTube, podcast, archive, and custom profiles.*

- [ ] **Track: Real-Time Transcription**
  *Live captions during recording via streaming transcription.*

- [ ] **Track: Local Offline Transcription**
  *whisper.cpp-based local transcription engine.*

- [ ] **Track: Auto-Save & Crash Recovery**
  *Background project snapshots and recovery dialog on restart.*

- [ ] **Track: Import/Export/Backup/Repair**
  *ZIP archives, scheduled backups, and database repair tools.*

---

## Archive

Completed, superseded, and abandoned tracks are stored in [./archive](./archive/).

Old active tracks from before the greenfield rewrite have been archived under the `superseded_greenfield_20260612_*` prefix.

### Greenfield MVP

- [x] **Track: MVP Library & Export** [created: 2026-06-12] [completed: 2026-06-14] [archived: 2026-06-14]
  *Focus: Library list/delete view and export of the original media file.*
  *Status: Done. All five acceptance criteria satisfied at HEAD: `TestLibraryView_SetRecordings` (AC1), `TestRecordingRepository_Delete` + `TestController_DeleteRecording_*` (AC2), `TestExporter_HappyPath_CopiesFile` + `TestSmoke_ControllerExportLive` (AC3), `TestExporter_ProgressMonotonic` + `TestExporter_*Error` (AC4), and `make check` 18/18 green (AC5). FR2 status enum vocabulary drift resolved in `7aefac5` (`a22d48a`); one Low-severity UX polish item (library delete has no confirmation dialog) deferred to a post-MVP UX track and logged in `measure/tech-debt.md`.*
  *Link: [./archive/mvp_library_export_20260612](./archive/mvp_library_export_20260612/)*
