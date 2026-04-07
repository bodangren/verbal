# Project Tracks

This file tracks all major tracks for the project. Each track has its own detailed plan in its respective folder.

---

## Active & Planned Tracks

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

- [ ] **Track: Database & Recording Management**
  Implement a persistent storage layer (SQLite) to manage recording history, metadata, and searchable transcripts.

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
