# Project Tracks

This file tracks all major tracks for the project. Each track has its own detailed plan in its respective folder.

---

## Active & Planned Tracks

- [x] **Track: Chore - Repository Initialization Audit** [created: 2026-04-23, started: 2026-04-23, completed: 2026-04-23]
  *Focus: Audit codebase for improper struct{} initialization patterns instead of factory methods that ensure proper DB connection wiring.*
  *Status: Complete. Audited all repository patterns - all properly initialized via factory methods. No issues found.*
  *Link: [./tracks/chore_repository_initialization_audit_20260423/](./tracks/chore_repository_initialization_audit_20260423/)*

- [x] **Track: Bugfix - Transcription Result Usability and Persistence** [created: 2026-04-17, started: 2026-04-17, completed: 2026-04-17]
  *Focus: Make completed transcription timing data discoverable, keep the playback window usable on laptop screens, and reload saved transcription results.*
  *Status: Complete. Timed words use a labeled scrolled view, the main window defaults to resizable 1000x640, and saved `.meta.json` transcriptions reload on reopen.*
  *Link: [./tracks/bugfix_transcription_timing_view_20260417/](./tracks/bugfix_transcription_timing_view_20260417/)*

- [x] **Track: Bugfix - Transcription Max Retries Diagnostic Failure** [created: 2026-04-17, started: 2026-04-17, reopened: 2026-04-17, completed: 2026-04-17]
  *Focus: Fix transcription failures surfacing only as generic `max retries exceeded`, and make provider/network/API failures diagnosable from the UI and metadata.*
  *Status: Complete. OpenAI video transcription now uses GStreamer-extracted compressed FLAC plus local 25 MB upload preflight; provider errors remain copyable with retry context.*
  *Link: [./tracks/bugfix_transcription_retry_diagnostics_20260417/](./tracks/bugfix_transcription_retry_diagnostics_20260417/)*

- [x] **Track: Bugfix - MP4 File Open Does Not Load Playback** [created: 2026-04-17, started: 2026-04-17, completed: 2026-04-17]
  *Focus: Fix the manual QA blocker where selecting an MP4 in the open file dialog returns but does not load anything into the app.*
  *Status: Complete. Open-file dialog now switches to playback, shows a loaded-file fallback widget, and playback pipeline paths are quoted for GStreamer.*
  *Link: [./tracks/bugfix_mp4_open_load_20260417/](./tracks/bugfix_mp4_open_load_20260417/)*

- [x] **Track: Chore - Manual Test Readiness and Project Status Audit** [created: 2026-04-17, started: 2026-04-17, completed: 2026-04-17]
  *Focus: Reconcile current project status, run automated verification, and produce a manual QA checklist for the Linux/GNOME app surface.*
  *Status: Complete. Full tests, build, vet, smoke check, and bounded GTK launch pass; manual QA checklist documented in plan.md.*
  *Link: [./tracks/chore_manual_test_readiness_20260417/](./tracks/chore_manual_test_readiness_20260417/)*

- [x] **Track: Chore - RecordingRepository Query/Scan Refactoring** [created: 2026-04-17, started: 2026-04-17, completed: 2026-04-17]
  *Focus: Reduce ~200 lines of duplication in internal/db/repository.go by extracting common query/scan patterns.*
  *Status: Complete. Extracted scanRecording() helper and recordingColumns constant. Reduced 531 lines to 422 lines (-109 lines). All 43 tests pass.*
  *Link: [./tracks/chore_recording_repository_refactor_20260417/](./tracks/chore_recording_repository_refactor_20260417/)*

- [x] **Track: Bugfix - BackupScheduler Robustness Improvements** [created: 2026-04-17, started: 2026-04-17, completed: 2026-04-17]
  *Focus: Fix medium-severity backup scheduler issues: panic recovery, logger integration, and error handling.*
  *Status: Complete. Added Logger interface, safeCallback() with panic recovery, replaced stderr writes with logger calls, updated all call sites.*
  *Link: [./tracks/bugfix_backup_scheduler_robustness_20260417/](./tracks/bugfix_backup_scheduler_robustness_20260417/)*

- [x] **Track: Bugfix - Waveform GStreamer Path Sanitization** [created: 2026-04-16, started: 2026-04-16, completed: 2026-04-16]
  *Focus: Fix security vulnerability where file paths are interpolated into GStreamer pipelines without sanitization.*
  *Status: Complete. Added quoteLocation() function, applied sanitization to generator.go and gstreamer_extractor.go, added comprehensive unit tests.*
  *Link: [./tracks/bugfix_waveform_path_sanitization_20260416/](./tracks/bugfix_waveform_path_sanitization_20260416/)*

- [x] **Track: Bugfix - Backup Atomicity and Safety** [created: 2026-04-14, started: 2026-04-14, completed: 2026-04-16]
  *Focus: Fix high severity backup safety issues: atomic backup/restore, proper file permissions, and safe SQLite operations.*
  *Status: Complete. All 6 phases finished: Permission fixes (0700/0600), timestamp format, BEGIN IMMEDIATE transaction for atomic backup, atomic restore with snapshot/rollback, integration/refactoring, test coverage >80%, and documentation.*  
  *Link: [./tracks/bugfix_backup_atomicity_safety_20260414/](./tracks/bugfix_backup_atomicity_safety_20260414/)*

- [x] **Track: Feature - Recording Data Lifecycle Enhancements** [created: 2026-04-10, started: 2026-04-10, completed: 2026-04-14]
  *Focus: Add import/export, repair tooling, and recovery workflows for library database content.*
  *Status: Completed. All 5 phases finished: Import/Export with ZIP archives, Repair tool with Inspector/Repairer, Backup system with Manager/Scheduler/Settings UI, and full menu integration into main.go. All features operational via keyboard shortcuts (Ctrl+Shift+I/E/R/B).*
  *Link: [./tracks/feature_recording_lifecycle_20260410/](./tracks/feature_recording_lifecycle_20260410/)*

- [x] **Track: Feature - Real Audio Waveform Extraction** [started: 2026-04-10, completed: 2026-04-10]
  *Focus: Replace synthetic waveform data generation with real audio extraction using GStreamer.*
  *Status: Completed. All 3 phases finished: AudioExtractor interface, GStreamerExtractor implementation with gst-launch-1.0, Generator integration, and comprehensive tests.*
  *Link: [./tracks/feature_real_waveform_audio_extraction_20260410/](./tracks/feature_real_waveform_audio_extraction_20260410/)*

- [x] **Track: Bugfix - Exact Recording Lookup for Transcription Updates** [started: 2026-04-10, completed: 2026-04-10]
  *Focus: Replace LIKE-based DB lookup in transcription update paths with exact file path matching to avoid wrong-record writes.*
  *Status: Completed. Added exact-path lookup methods (`GetByPathExact`, `GetByPath`), switched transcription persistence paths to exact matching, and added status-aware update handling for error vs completed states.*
  *Link: [./tracks/bugfix_recording_lookup_exact_match_20260410/](./tracks/bugfix_recording_lookup_exact_match_20260410/)*

- [x] **Track: Feature - Database & Recording Management** [started: 2026-04-06, completed: 2026-04-10]
  *Focus: Implement persistent storage layer (SQLite) for recording history, metadata, and searchable transcripts.*
  *Status: Reconciled to completed on 2026-04-10. Original partial execution was finalized through successor tracks and documented with full Conductor artifacts.*
  *Link: [./tracks/feature_database_recording_management_20260406/](./tracks/feature_database_recording_management_20260406/)*

- [x] **Track: Chore - Test Truthfulness and Runtime Verification** [started: 2026-04-09, reopened: 2026-04-09, revalidated: 2026-04-09, rerun: 2026-04-09]
  *Focus: Audit every test for behavioral validity, close false-positive coverage gaps, add runtime build/start smoke checks, and revalidate against latest workspace state.*
  *Status: Revalidation rerun completed on 2026-04-09. Verified again by full suite pass (`go test ./... -count=1`), full build pass (`go build ./...`), startup smoke E2E pass (`TestE2E_BinaryBuildAndStartupSmoke`), direct startup smoke path (`go run ./cmd/verbal --smoke-check`), and bounded live GTK launch (`timeout 10s go run ./cmd/verbal` stayed running until timeout).*
  *Link: [./tracks/chore_test_truthfulness_e2e_20260409/](./tracks/chore_test_truthfulness_e2e_20260409/)*

- [x] **Track: Feature - Video Thumbnails for Library Items** [started: 2026-04-09, completed: 2026-04-09]
  *Focus: Generate video thumbnails for recording library items using GStreamer frame extraction.*
  *Status: All 5 phases complete. Features: DB-backed thumbnail persistence, GStreamer extraction, thumbnail widget integration, background queued generation, and freshness regeneration checks.*
  *Link: [./tracks/feature_video_thumbnails_20260409/](./tracks/feature_video_thumbnails_20260409/)*

- [x] **Track: Feature - Waveform Visualization** [started: 2026-04-08, completed: 2026-04-09]
  *Focus: Add audio waveform visualization to playback view for visual navigation and editing cues.*
  *Status: All 5 phases complete. Features: data generation, GTK4 widget, integration, scroll/zoom/selection, tooltips.*
  *Link: [./tracks/feature_waveform_visualization_20260408/](./tracks/feature_waveform_visualization_20260408/)*

- [x] **Track: Feature - Settings UI for AI Provider Configuration** [started: 2026-04-07, completed: 2026-04-08]
  *Focus: Add settings/preferences UI for configuring AI transcription providers.*
  *Link: [./tracks/feature_settings_ui_20260407/](./tracks/feature_settings_ui_20260407/)*

- [x] **Track: Feature - Recording Library View** [started: 2026-04-07, completed: 2026-04-07]
  *Focus: Add library/recording management view with database integration and search.*
  *Link: [./tracks/feature_recording_library_20260407/](./tracks/feature_recording_library_20260407/)*

- [x] **Track: Feature - PlaybackWindow Integration into Main App** [started: 2026-04-05, completed: 2026-04-05]
  *Focus: Wire PlaybackWindow, sync integration, and editable transcription into main.go.*
  *Link: [./tracks/feature_playback_integration_20260405/](./tracks/feature_playback_integration_20260405/)*

- [x] **Track: Feature - Edit Transcription and Export Cuts** [started: 2026-04-05, completed: 2026-04-05]
  *Focus: Editable transcription UI, segment selection, and GStreamer-based video cut export.*
  *Link: [./tracks/feature_edit_transcription_20260405/](./tracks/feature_edit_transcription_20260405/)*

- [x] **Track: Chore - Refactor/Cleanup 2026-04-04** [started: 2026-04-04, completed: 2026-04-04]
  *Focus: Post-Phase 4 cleanup, dead code removal, and test coverage improvements.*
  *Link: [./tracks/chore_20260404/](./tracks/chore_20260404/)*

- [x] **Track: Chore - Refactor/Cleanup 2026-04-03** [started: 2026-04-03, completed: 2026-04-03]
  *Focus: Post-Phase 3 cleanup and build verification. No issues found.*
  *Link: [./tracks/chore_20260403/](./tracks/chore_20260403/)*

- [x] **Track: Chore - Refactor/Cleanup 2026-04-02** [started: 2026-04-02, completed: 2026-04-02]
  *Focus: Cleanup from video sync Phases 1-2; add edge case tests; prepare for Phase 3.*
  *Link: [./tracks/chore_20260402/](./tracks/chore_20260402/)*

- [x] **Track: Chore - Refactor/Cleanup 2026-04-01** [started: 2026-04-01, completed: 2026-04-01]
  *Focus: Add missing tests for sync controller to achieve 100% coverage.*
  *Link: [./tracks/chore_20260401/](./tracks/chore_20260401/)*

- [x] **Track: Feature - Video Playback with Transcription Sync** [started: 2026-03-31, completed: 2026-04-04]
  *Focus: Implement synchronized video playback with word-level transcription highlighting.*
  *Status: All 5 phases complete. Manual QA pending (requires display + hardware).*
  *Link: [./tracks/feature_video_sync_20260331/](./tracks/feature_video_sync_20260331/)*

- [x] **Track: Chore - Refactor/Cleanup 2026-03-31** [started: 2026-03-31, completed: 2026-03-31]
  *Focus: Final cleanup and preparation for video sync feature.*
  *Link: [./tracks/chore_20260331/](./tracks/chore_20260331/)*

- [x] **Track: Chore - Refactor/Cleanup 2026-03-30** [started: 2026-03-30, completed: 2026-03-30]
  *Focus: Cleanup and address tech debt from March 28 AI provider implementation.*
  *Link: [./tracks/chore_20260330/](./tracks/chore_20260330/)*

- [x] **Track: Feature - Real AI Provider Implementations** [started: 2026-03-28, completed: 2026-03-28]
  *Focus: Replace stub providers with real OpenAI Whisper and Google Speech-to-Text HTTP clients.*
  *Link: [./tracks/feature_real_ai_providers_20260328/](./tracks/feature_real_ai_providers_20260328/)*

- [x] **Track: Chore - Refactor/Cleanup 2026-03-28** [started: 2026-03-28, completed: 2026-03-28]
  *Focus: Wire transcription into main UI; add unit tests; resolve regression.*
  *Link: [./tracks/chore_20260328/](./tracks/chore_20260328/)*

- [x] **Track: Feature - Transcription Integration** [started: 2026-03-26, completed: 2026-03-26]
  *Focus: Integrate AI transcription into main app with UI for results.*
  *Link: [./tracks/feature_transcription_integration_20260326/](./tracks/feature_transcription_integration_20260326/)*

- [x] **Track: Feature - AI Provider Abstraction Layer** [started: 2026-03-26, completed: 2026-03-26]
  *Focus: Provider-agnostic interface for AI transcription (OpenAI/Google).*
  *Link: [./tracks/feature_ai_provider_20260326/](./tracks/feature_ai_provider_20260326/)*

- [x] **Track: Feature - Embedded Video Preview in GTK4** [started: 2026-03-26, completed: 2026-03-26]
  *Focus: Replace external video window with embedded preview using gtk4paintablesink.*
  *Link: [./tracks/feature_embedded_video_20260326/](./tracks/feature_embedded_video_20260326/)*

- [x] **Track: Chore - Hardware Recording Integration** [started: 2026-03-26, completed: 2026-03-26]
  *Focus: Refactor recording pipeline to use real webcam/mic with graceful fallback.*
  *Link: [./tracks/chore_20260326/](./tracks/chore_20260326/)*

- [x] **Track: Core Setup - Go + GTK4 + GStreamer** [started: 2026-03-25, completed: 2026-03-26]
  *Focus: Project scaffolding, basic GTK window, and GStreamer pipeline initialization.*
  *Link: [./tracks/core_setup_20260325/](./tracks/core_setup_20260325/)*

---

## Future Roadmap

- [ ] **Track: Advanced Media Processing & Editing**
  Implement GStreamer-based local editing capabilities (trimming, concatenating) and multi-track support.

- [ ] **Track: Enhanced UI/UX & Waveform Visualization**
  Integrate real-time audio waveform visualization and a timeline view for transcripts synchronized with video playback.

- [ ] **Track: Recording Data Lifecycle Enhancements**
  Add import/export, repair tooling, and recovery workflows for library database content.

- [ ] **Track: Offline AI & Local Transcription**
  Add support for local transcription engines like Whisper (via CGo or local binary) to fulfill offline-first capabilities.

- [ ] **Track: Real-time Transcription Stream**
  Transition from file-based transcription to real-time GStreamer app-sink streaming for live captioning during recording.

---

## Superseded (Tauri/Rust Implementation)

The following tracks were part of the initial Tauri/Rust prototype and have been superseded by the pivot to Go and GTK4.

- [x] **Track: Chore - Refactor/Cleanup 2026-03-25** [superseded]
  *Link: [./archive/chore_20260325/](./archive/chore_20260325/)*
- [x] **Track: Fix Critical Bugs from Code Review** [superseded]
  *Link: [./archive/bugfix_20260324/](./archive/bugfix_20260324/)*
- [x] **Track: Automated Transcription & Filler Word Detection** [superseded]
  *Link: [./archive/transcription_20260324/](./archive/transcription_20260324/)*
- [x] **Track: AI Provider Abstraction Layer** [superseded]
  *Link: [./archive/ai_provider_20260323/](./archive/ai_provider_20260323/)*
- [x] **Track: Build core text-to-video sync and local FFmpeg cutting** [superseded]
  *Link: [./archive/buildcore_20260322/](./archive/buildcore_20260322/)*
- [x] **Track: Fix Webcam Connection Issue (Pipewire → CrabCamera)** [superseded]
  *Link: [./archive/fix_webcam_20260324/](./archive/fix_webcam_20260324/)*
