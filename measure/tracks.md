# Project Tracks

This file tracks all major tracks for Verbal. Each track has its own detailed plan in its respective folder.

> ⚠️ **Stack supersession (2026-11-20).** The GTK4 + GStreamer + Go implementation is retired; see [tech-stack.md](./tech-stack.md). Every track below the "Historical" heading was written against that stack. They are kept as reference and must be rewritten before implementation. The greenfield backlog/codebase integrity flag raised on 2026-06-21 is **resolved by the rewrite**: the unreconciled legacy implementations are being deleted, not reconciled.

## Active Tracks

- [~] **Track: TypeScript Rewrite** [created: 2026-11-20]
  *Focus: Replace the GTK/GStreamer/Go application with vinext + React + TypeScript, a local Node server, FFmpeg media engine, and JSON project documents. Deliver project format, import/probe, transcript editor, cut list, FFmpeg export, playback sync, and the provider abstraction.*
  *Status: In progress — Phases 0–2 complete (workspace, vinext Pages Router, tooling, FFmpeg detection, project documents + atomic storage, ffprobe parsing + media import; `npm run check` green with 56 tests). Phase 3 next.*
  *Link: [./tracks/rewrite_ts_vinext_20261120](./tracks/rewrite_ts_vinext_20261120/)*

- [ ] **Track: Storyboard Compositor** [created: 2026-11-20]
  *Focus: Green-screen capture, reviewed cleanup, storyboard IR, Remotion motion slides, composited preview, chat-driven patch feedback, brand-kit export. Asset ladder: motion slides → generated images → generated video.*
  *Status: Blocked on the TypeScript Rewrite reaching cut-list export. Product decisions (IR, word-span anchors, patches, preview tiers, brand kit, asset ladder) carry over unchanged; stack references in its spec are stale until refreshed.*
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

Old active tracks from before the greenfield rewrite are archived under the `superseded_greenfield_20260612_*` prefix. Archiving the retired GTK-era tracks listed above is a follow-up task in the rewrite track; until then they remain in `measure/tracks/` as reference.
