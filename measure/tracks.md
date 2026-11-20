# Project Tracks

This file tracks all major tracks for Verbal. Each track has its own detailed plan in its respective folder.

> ⚠️ **Stack supersession (2026-11-20).** The GTK4 + GStreamer + Go implementation is retired; see [tech-stack.md](./tech-stack.md). Every track below the "Historical" heading was written against that stack. They are kept as reference and must be rewritten before implementation. The greenfield backlog/codebase integrity flag raised on 2026-06-21 is **resolved by the rewrite**: the unreconciled legacy implementations are being deleted, not reconciled.

## Active Tracks

- [x] **Track: Cleanup Detection and Review** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Detect filler words, stutters, and repetitions from the transcript, serve them, review them on the page, and remove only the accepted proposals.*
  *Status: Complete. `detectProposals` finds filler words, stutters, and repeated bigrams; `GET /api/cleanup` serves them; the page reviews, accepts by category or id, and removes accepted spans as one undoable edit. `npm run check` green (489 tests); `npm run e2e` reviews a filler, removes it, saves, and confirms it stays removed after a reload. Dead air, audio fixes, LLM proposals, and freezing the master stay out of scope.*
  *Link: [./tracks/cleanup_detection_20261121](./tracks/cleanup_detection_20261121/)*

- [x] **Track: Playback and Sync** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Serve project media over HTTP with byte ranges, render the playback screen, and keep the transcript highlighted and click-to-seek in sync.*
  *Status: Complete. `GET /api/media/file` streams the project's media with 200/206/416 and HEAD; the page renders a Playback panel; the active word follows playback and clicking one seeks. `npm run check` green (470 tests); `npm run e2e` plays a real generated clip in Chromium, sees the highlight advance, and seeks to a word.*
  *Link: [./tracks/playback_sync_20261121](./tracks/playback_sync_20261121/)*

- [x] **Track: Transcript Editing** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Delete words and shift-click ranges from the transcript editor, undo/redo, and save the edited document with a dirty indicator.*
  *Status: Complete. Selection, keyboard/mouse delete, undo/redo with Ctrl/Cmd shortcuts, explicit save through `PUT /api/transcript`, and reload persistence. `npm run check` green (425 tests); `npm run e2e` deletes, undoes, redoes, saves, reloads, and confirms the struck-through words.*
  *Link: [./tracks/transcript_editing_20261121](./tracks/transcript_editing_20261121/)*

- [x] **Track: TypeScript Rewrite** [created: 2026-11-20] [completed: 2026-11-20]
  *Focus: Replace the GTK/GStreamer/Go application with vinext + React + TypeScript, a local Node server, FFmpeg media engine, and JSON project documents.*
  *Status: Complete. All nine phases implemented; `npm run check` green with 175 tests, including a real FFmpeg export round trip and an end-to-end import → transcript → delete → export test. The Go implementation has been removed and its tracks archived.*
  *Link: [./tracks/rewrite_ts_vinext_20261120](./tracks/rewrite_ts_vinext_20261120/)*

- [~] **Track: Storyboard Compositor** [created: 2026-11-20]
  *Focus: Green-screen capture, reviewed cleanup, storyboard IR, Remotion motion slides, composited preview, chat-driven patch feedback, brand-kit export. Asset ladder: motion slides → generated images → generated video.*
  *Status: All planned phases complete (0–11), plus a browser walkthrough (9d). `npm run check` green with 418 tests; `npm run e2e` drives the real page in Chromium and passes. Both asset stages and export verified live. Unverified: capture on hardware and real paid provider calls. Generated assets are never pruned (tech-debt).*
  *Link: [./tracks/storyboard_compositor_20261120](./tracks/storyboard_compositor_20261120/)*

---

## Historical — GTK4/GStreamer/Go implementation (retired 2026-11-20)

Kept for reference. Do not implement these as written.

| Track | Original status | Note |
| --- | --- | --- |
| Greenfield Project Setup | Complete (2026-06-12) | Domain/schema/controller layer, now superseded. |
| MVP Recording & Import | Planned | Product requirement survives the rewrite; legacy `importdialog.go` existed. |
| MVP Transcription | Planned | Word-level timestamps are the anchor index's input — **carry this forward**. |
| MVP Playback & Sync | In progress (21/36) | Word highlighting and click-to-seek survive as concepts. |
| MVP Text-Driven Delete | Planned | The cut list is the rewrite's Phase 5 target. |
| MVP Library & Export | Archived (2026-06-14) | Export presets and library UX inform the new UI. |
| Multi-Range Delete & Reorder | Planned (2026-07-05) | Re-plan on the new stack. |
| Undo/Redo System | Roadmap | Re-plan. |
| Waveform & Timeline Visualization | Roadmap | Re-plan; `showwavespic` makes this cheaper. |
| Filler Word Detection & Removal | Roadmap | Re-plan; logic is portable. |
| Transcript Search & Navigation | Roadmap | Re-plan. |
| Batch Transcription Queue | Roadmap | Re-plan. |
| Export Presets & Profiles | Roadmap | Re-plan. |
| Real-Time Transcription | Roadmap | Re-plan. |
| Local Offline Transcription | Roadmap | Re-plan. |
| Auto-Save & Crash Recovery | Roadmap | Re-plan; atomic JSON writes cover much of this. |
| Import/Export/Backup/Repair | Roadmap | Re-plan. |

## Archive

Completed, superseded, and abandoned tracks are stored in [./archive](./archive/).

Old active tracks from before the greenfield rewrite are archived under the `superseded_greenfield_20260612_*` prefix. The retired GTK-era tracks were archived on 2026-11-20 under the `superseded_ts_rewrite_20261120_*` prefix.
