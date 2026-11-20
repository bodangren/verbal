# Project Tracks

This file tracks all major tracks for Verbal. Each track has its own detailed plan in its respective folder.

> ⚠️ **Stack supersession (2026-11-20).** The GTK4 + GStreamer + Go implementation is retired; see [tech-stack.md](./tech-stack.md). Every track below the "Historical" heading was written against that stack. They are kept as reference and must be rewritten before implementation. The greenfield backlog/codebase integrity flag raised on 2026-06-21 is **resolved by the rewrite**: the unreconciled legacy implementations are being deleted, not reconciled.

## Active Tracks

- [~] **Track: Application Shell and Workflow** [created: 2026-11-21]
  *Focus: Replace the scrolling panel stack with a viewport-locked three-pane shell and Ingest/Edit/Deliver modes.*
  *Status: In progress — Phase 1 started.*
  *Link: [./tracks/app_shell_20261121](./tracks/app_shell_20261121/)*

- [x] **Track: Local Offline Transcription** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Add a whisper-CLI provider so transcription can run locally, selected by environment, behind the existing provider abstraction.*
  *Status: Complete. `createLocalWhisperProvider` shells out with an argv array (missing binary → 503, missing output → error, never a silent empty transcript), `parseWhisperJson` converts millisecond offsets once, and `VERBAL_ASR=local` selects it in the shared service without requiring `OPENAI_API_KEY`. `npm run check` green (621 tests); `npm run e2e` still passes on the cloud fake-ASR path. **Unverified:** the real CLI invocation — this machine has no whisper binary (tracked as tech debt).*
  *Link: [./tracks/local_transcription_20261121](./tracks/local_transcription_20261121/)*

- [x] **Track: Library UX** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Scan a folder for projects, serve the summaries, and list and open them from the page instead of typing a path.*
  *Status: Complete. `scanLibrary` summarises one level of a folder (newest first, skips non-projects and unreadable documents, counts kept vs removed words); `GET /api/projects/list` serves it and answers 400 for a missing folder; the Library panel lists projects and opens one through the same path as typing a path. `npm run check` green (607 tests); `npm run e2e` scans a folder and opens a project from the library.*
  *Link: [./tracks/library_ux_20261121](./tracks/library_ux_20261121/)*

- [x] **Track: Batch Transcription** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Plan which projects still need transcribing, run them one at a time, and report each outcome in the UI.*
  *Status: Complete. `planBatch` derives the plan (skip `transcribed` unless forced, `no-media` always, duplicates collapsed); `runBatch` runs items sequentially and continues past a failure; `createTranscribeService` is shared by the single and batch routes, with an awaitable `transcribeNow` for the batch; `POST /api/transcribe/batch` returns `{ plan, job }`; the page takes one root per line and lists outcomes. `npm run check` green (599 tests); `npm run e2e` batches two projects against the fake ASR and asserts both outcomes.*
  *Link: [./tracks/batch_transcription_20261121](./tracks/batch_transcription_20261121/)*

- [x] **Track: Timeline Waveform** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Render a cached waveform from showwavespic, show it beside the playback video, and seek where it is clicked.*
  *Status: Complete. `buildWaveformArgs` builds the showwavespic argv with clamped size and a validated colour; `GET /api/media/waveform` caches the PNG keyed on source path, size, mtime, and options; the playback panel shows the waveform and seeks proportionally on click, with the arithmetic in a pure helper. `npm run check` green (585 tests); `npm run e2e` clicks the waveform and asserts the media sought past halfway.*
  *Link: [./tracks/timeline_waveform_20261121](./tracks/timeline_waveform_20261121/)*

- [x] **Track: Reorder Text** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Move an inclusive word block, keep segments consistent, and expose the action on the selected range as one undo step.*
  *Status: Complete. `moveRange` moves a clamped block (a target at or inside the block is a no-op), gives moved words to the segment they land beside, drops emptied segments, and leaves ids, texts, and timings untouched. It is exposed on the editing hook as one undo step and as Move earlier/Move later on the selection. `npm run check` green (567 tests); `npm run e2e` moves a word, checks the order, and undoes it.*
  *Link: [./tracks/reorder_text_20261121](./tracks/reorder_text_20261121/)*

- [x] **Track: Asset Pruning** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Plan which generated assets are still referenced, report the plan, and delete only on explicit confirmation.*
  *Status: Complete. `planAssetPrune` keeps referenced assets and user uploads, retains unreferenced generations under the age threshold, and prunes only past it; `POST /api/storyboard/prune` reports the plan and deletes only with `apply`; the page reports first and offers deletion as a second click. `npm run check` green (554 tests); `npm run e2e` reports that nothing is prunable for a project with no generated assets.*
  *Link: [./tracks/asset_pruning_20261121](./tracks/asset_pruning_20261121/)*

- [x] **Track: Export Presets** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Name the export codec bundles, thread the choice through POST /api/export, and offer a selector on the page.*
  *Status: Complete. `EXPORT_PRESETS` names web H.264, WebM VP9, archive H.264, and podcast audio as codec bundles plus a container; an unknown id falls back to the default and the extension is forced so FFmpeg picks the right muxer. The route applies the preset's codecs and echoes the id; the Export panel offers a selector. `npm run check` green (540 tests); `npm run e2e` selects a preset in Chromium.*
  *Link: [./tracks/export_presets_20261121](./tracks/export_presets_20261121/)*

- [x] **Track: Insert Silence and Split Segment** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Add the last two v1 text operations — insert air after a word and start a new caption segment — and make them undoable from the page.*
  *Status: Complete. `insertSilence` shifts later word timestamps (silence is a gap, so no media work), `splitSegment` starts a new segment with a free `s<n>` id, and both are no-ops at zero duration and at a segment head. Both are exposed on the editing hook as single undo steps and as panel actions on the selected word. `npm run check` green (529 tests); `npm run e2e` splits a segment, inserts silence, and undoes both.*
  *Link: [./tracks/silence_split_20261121](./tracks/silence_split_20261121/)*

- [x] **Track: Auto-Save Transcript Edits** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Save settled transcript edits automatically, without overlapping writes, while keeping the explicit Save control.*
  *Status: Complete. `useAutoSave` debounces settled edits, cancels when the document returns to clean, and keeps saves single-flight with at most one queued follow-up; the status line reports Saving…/Unsaved changes/Saved. `npm run check` green (515 tests); `npm run e2e` deletes, undoes, and redoes, then reaches Saved with no Save click.*
  *Link: [./tracks/auto_save_20261121](./tracks/auto_save_20261121/)*

- [x] **Track: Transcript Search and Navigation** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Search the transcript for phrases, highlight matches in the editor, and step between them from the page.*
  *Status: Complete. `searchTranscript` matches phrases across word boundaries, ignoring case and punctuation, and treats removed words as hard breaks; the editor marks matches with `data-match`; the panel has a Find field, match count, and wrapping Previous/Next that selects the match. `npm run check` green (509 tests); `npm run e2e` finds a word, sees it highlighted, and steps to it.*
  *Link: [./tracks/transcript_search_20261121](./tracks/transcript_search_20261121/)*

- [x] **Track: Freeze Master and Cut List** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Freeze the cleaned master from the document's removals, expose it over HTTP, and wire the review's Freeze master control.*
  *Status: Complete. `freezeMaster` now honours `removedWordIds` already saved (it used to resurrect deleted words); `POST /api/cleanup/freeze` returns the cut list, anchors, and fingerprint and persists them in `edit.json`; the review's Freeze master control reports duration, anchor count, and fingerprint. `npm run check` green (500 tests); `npm run e2e` freezes the project in Chromium.*
  *Link: [./tracks/freeze_master_20261121](./tracks/freeze_master_20261121/)*

- [x] **Track: Transcription in the UI** [created: 2026-11-21] [completed: 2026-11-21]
  *Focus: Start transcription from the page, follow the job, and refresh the transcript, playback, and cleanup proposals on success.*
  *Status: Complete. A Transcription panel starts `/api/transcribe`, follows the job, and reloads the transcript and proposals on success. The route is verified against a fake OpenAI-compatible ASR (job completes, words stored, 503 without a key). `npm run check` green (492 tests); `npm run e2e` transcribes a real clip in Chromium against the fake ASR and shows both the words and the filler proposal.*
  *Link: [./tracks/transcription_ui_20261121](./tracks/transcription_ui_20261121/)*

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
