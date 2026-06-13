# Project Tracks

This file tracks all major tracks for the Verbal greenfield rewrite. Each track has its own detailed plan in its respective folder.

Active tracks implement the MVP defined in [product.md](./product.md). Roadmap tracks implement post-MVP features.

---

## Active Tracks

- [x] **Track: Greenfield Project Setup** [created: 2026-06-12] [completed: 2026-06-12]
  *Focus: Scaffold the new project structure, domain model, SQLite schema with versioned migrations, app controller, and CI checks.*
  *Status: Complete. All acceptance criteria passed; `make check` and smoke check verified.*
  *Link: [./tracks/greenfield_project_setup_20260612](./tracks/greenfield_project_setup_20260612/)*

- [ ] **Track: MVP Recording & Import** [created: 2026-06-12]
  *Focus: Record video/audio from V4L2/PipeWire and import existing media files into the library.*
  *Status: Planned.*
  *Link: [./tracks/mvp_recording_import_20260612](./tracks/mvp_recording_import_20260612/)*

- [ ] **Track: MVP Transcription** [created: 2026-06-12]
  *Focus: Provider-agnostic transcription interface with OpenAI Whisper and Google Speech-to-Text implementations; word-level timestamp storage.*
  *Status: Planned.*
  *Link: [./tracks/mvp_transcription_20260612](./tracks/mvp_transcription_20260612/)*

- [ ] **Track: MVP Playback & Sync** [created: 2026-06-12]
  *Focus: Embedded GStreamer playback, clickable transcript, and current-word highlighting.*
  *Status: Planned.*
  *Link: [./tracks/mvp_playback_sync_20260612](./tracks/mvp_playback_sync_20260612/)*

- [x] **Track: MVP Library & Export** [created: 2026-06-12] [completed: 2026-06-14]
  *Focus: Library list/delete view and export of the original media file.*
  *Status: Complete. All five acceptance criteria satisfied at HEAD: `TestLibraryView_SetRecordings` (AC1), `TestRecordingRepository_Delete` + `TestController_DeleteRecording_*` (AC2), `TestExporter_HappyPath_CopiesFile` + `TestSmoke_ControllerExportLive` (AC3), `TestExporter_ProgressMonotonic` + `TestExporter_*Error` (AC4), and `make check` 18/18 green (AC5). One Low-severity spec drift remains (status enum vocabulary `pending|in_progress|completed|error` vs. FR2's `New|Transcribing|Transcribed|Error` UI labels; UI maps via `formatStatus`). See `measure/tech-debt.md`.*
  *Link: [./tracks/mvp_library_export_20260612](./tracks/mvp_library_export_20260612/)*

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
