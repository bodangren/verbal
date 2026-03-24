# Project Tracks

This file tracks all major tracks for the project. Each track has its own detailed plan in its respective folder.

---

## Active & Planned Tracks

- [x] **Track: Chore - Refactor/Cleanup 2026-03-22 Work** [completed: 2026-03-23]
  *Link: [./tracks/chore_20260323/](./tracks/chore_20260323/)*

- [x] **Track: Build core text-to-video sync and local FFmpeg cutting** [completed: 2026-03-23]
  *Link: [./tracks/buildcore_20260322/](./tracks/buildcore_20260322/)*

- [x] **Track: Chore - Refactor/Cleanup AI Provider Work** [completed: 2026-03-24]
  *Link: [./tracks/chore_20260324/](./tracks/chore_20260324/)*

- [x] **Track: AI Provider Abstraction Layer** [completed: 2026-03-24]
  *Link: [./tracks/ai_provider_20260323/](./tracks/ai_provider_20260323/)*

- [x] **Track: Automated Transcription & Filler Word Detection** [completed: 2026-03-24]
  *Link: [./tracks/transcription_20260324/](./tracks/transcription_20260324/)*

- [x] **Track: Chore - Fix Rust Warnings & Tech Debt** [completed: 2026-03-24]
  *Link: [./tracks/chore_20260324b/](./tracks/chore_20260324b/)*

- [~] **Track: Fix Webcam Connection Issue (Pipewire → CrabCamera)** [blocked: manual QA required]
  *Link: [./tracks/fix_webcam_20260324/](./tracks/fix_webcam_20260324/)*
  *getUserMedia unviable on stock Linux WebKitGTK. Replaced with CrabCamera (V4L2). All tests pass. Blocked on Phase 4 manual verification.*

- [ ] **Track: Chore - Refactor/Cleanup 2026-03-25** [planned]
  *Link: [./tracks/chore_20260325/](./tracks/chore_20260325/)*
  *Focus: FFmpeg async command fix (medium severity), minor cleanup.*

- [x] **Track: Fix Critical Bugs from Code Review** [completed: 2026-03-24]
  *Link: [./tracks/bugfix_20260324/](./tracks/bugfix_20260324/)*
  *4 bugs fixed: empty recording Blob, JSON bloat on save, apply_cuts crash, stuck transcription jobs*

---

## Future Roadmap

The following tracks outline the path toward a production-ready "document-style" media editor.

- [ ] **Track: AI Provider Abstraction Layer (OpenAI & Google Ecosystems)**
  *Focus: Backend provider interface, credential management, and agnostic AI command routing.*

- [ ] **Track: Automated Transcription & Filler Word Detection (Whisper/Gemini)**
  *Focus: Asynchronous transcription pipelines, word-level timestamp extraction, and LLM-driven filler identification.*

- [ ] **Track: Project Media Library & SQLite Persistence**
  *Focus: Relational project storage, asset indexing, and local media library management via `rusqlite`.*

- [ ] **Track: Viral Auto-Clipping & Multi-Format Social Export**
  *Focus: LLM-based hook detection, aspect ratio conversion (vertical), and optimized social media export presets.*

- [ ] **Track: Generative AI Suite (B-Roll & Voice Overdub)**
  *Focus: Integration with Sora/Veo for context-aware cutaways and voice cloning for audio correction.*

- [ ] **Track: Studio Sound DSP & WebGL Dynamic Captions**
  *Focus: Local audio enhancement (leveling, noise reduction) and high-performance WebGL-rendered captions.*
