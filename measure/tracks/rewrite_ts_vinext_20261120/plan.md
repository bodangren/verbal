# Plan: TypeScript Rewrite

**Status:** PLANNED
**Created:** 2026-11-20
**Focus:** Replace the GTK/GStreamer/Go application with vinext + React + FFmpeg.

> **Rule for this track:** port concepts, not code. The Go implementation is a specification.

> **Check command:** `pnpm check` (typecheck + lint + test + build). This replaces `make check`.

---

## Phase 0: Scaffold and decision lock

- [ ] Rewrite `AGENTS.md` for the new stack (TypeScript, vinext Pages Router, FFmpeg argv, Measure workflow retained). Do this **before** any code, so future sessions stop being told to use Go/GTK.
- [ ] Scaffold with `pnpm create vinext-app`, selecting the **Pages Router**.
- [ ] Enable TypeScript `strict`, ESM, and path aliases for `packages/*`.
- [ ] Add Vitest, Testing Library, ESLint, and Prettier.
- [ ] Add `pnpm check` = `tsc --noEmit && eslint . && vitest run && vite build`.
- [ ] Create the empty package layout: `apps/web`, `packages/{core,media,storyboard,slides,ai}`, `tools/remotion`.
- [ ] Add a startup FFmpeg/ffprobe presence check with actionable output.
- [ ] Record the dev and prod commands in this plan.

**Exit criteria:** `pnpm check` is green on an empty app; `node dist/standalone/server.js` serves it.

---

## Phase 1: Project format and storage

Package: `packages/core`.

### Red
- [ ] Failing tests: `project.json` validates against its schema; missing required fields are rejected.
- [ ] Failing tests: unknown `schemaVersion` is rejected with a typed error.
- [ ] Failing tests: atomic write leaves the previous file intact when the write fails midway.
- [ ] Failing tests: corrupt JSON produces a typed parse error, not a crash.
- [ ] Failing tests: persisted paths are relative and reject absolute paths and `..` traversal.

**Targeted Red command:**
```bash
pnpm vitest run packages/core
```

### Green
- [ ] Implement document schemas and validators.
- [ ] Implement atomic write (`temp` + `fsync` + `rename`).
- [ ] Implement project creation and open.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(core): Add project documents and atomic storage`

---

## Phase 2: Import and probe

Package: `packages/media`, plus a route handler.

### Red
- [ ] Failing tests: `ffprobe -print_format json` output parses into a typed `MediaInfo` from recorded fixtures (video+audio, audio-only, odd frame rates, rotated).
- [ ] Failing tests: a probe failure surfaces the FFmpeg stderr excerpt.
- [ ] Failing tests: copy-import and reference-import produce the expected project layout.

### Green
- [ ] Implement the ffprobe runner behind an injected `Exec` interface.
- [ ] Implement import (copy vs reference) and thumbnail extraction.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(media): Add import and ffprobe metadata`

---

## Phase 3: Transcript model and editor

### Red
- [ ] Failing tests: word list parsing, stable IDs, and segment grouping.
- [ ] Failing tests: deleting a word or a contiguous range produces the expected cut-list ranges.
- [ ] Failing tests: undo/redo round-trips the document exactly.
- [ ] Component tests: words render, a click emits its index, a selection spans the expected words.

### Green
- [ ] Implement the transcript document and edit operations (pure).
- [ ] Implement the transcript editor component with word spans and selection.
- [ ] Implement undo/redo.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(ui): Add transcript editor with word-level editing`

---

## Phase 4: Cut list

### Red
- [ ] Failing tests: adjacent kept ranges merge.
- [ ] Failing tests: handles and a minimum-gap threshold are applied at boundaries.
- [ ] Failing tests: an all-deleted transcript produces an explicit empty result, not a zero-length range.
- [ ] Failing tests: serialisation is deterministic across runs.

### Green
- [ ] Implement `buildCutList(transcript, edit, options)` as a pure function.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(media): Add deterministic cut list builder`

---

## Phase 5: FFmpeg export

### Red
- [ ] Failing tests: the argv builder produces the expected segment/concat invocation for stream-copyable input (snapshot).
- [ ] Failing tests: non-keyframe-aligned boundaries switch to re-encode.
- [ ] Failing tests: filter values are escaped, and hostile paths cannot alter the argv.
- [ ] Integration test: generate a 10-second synthetic file with FFmpeg, apply two deletions, export, and assert the duration with ffprobe.
- [ ] Failing tests: cancellation terminates the child and removes partial output.

### Green
- [ ] Implement the argv builder (pure) and the runner (injected exec).
- [ ] Implement progress parsing and cancellation.
- [ ] Make tests pass.

### Refactor
- [ ] Commit: `feat(export): Add FFmpeg cut-list export`

**Exit criteria for parity — this is the gate that unblocks the storyboard track.**

---

## Phase 6: Playback and synchronisation

- [ ] Red: binary-search tests for word-at-time, including gaps and boundaries.
- [ ] Red: sync hook tests with a fake clock (advance time → expected active word).
- [ ] Green: `<video>` playback with click-to-seek.
- [ ] Green: active-word highlighting that does not re-render the whole transcript.
- [ ] Refactor + commit: `feat(ui): Add playback with word synchronisation`

---

## Phase 7: Local API and jobs

- [ ] Red: route-handler tests invoking handlers directly (no server).
- [ ] Red: job lifecycle tests (queued → running → done/failed/cancelled).
- [ ] Green: `pages/api/` handlers for project, import, probe, export, and job status.
- [ ] Green: job registry with progress events, persisting job records to disk and reconciling stale jobs on startup (dev HMR resets module state; a killed server orphans its children).
- [ ] Refactor + commit: `feat(api): Add local API and job registry`

---

## Phase 8: Provider abstraction

- [ ] Red: contract tests for the ASR and LLM interfaces using fakes.
- [ ] Green: implement one ASR adapter and one LLM adapter inside `packages/ai`.
- [ ] Green: wire transcription into the job registry.
- [ ] Refactor + commit: `feat(ai): Add provider interfaces and one adapter each`

---

## Phase 9: Parity and Go retirement

- [ ] Manual verification: import → transcribe → delete → export end to end.
- [ ] Compare output duration and audio continuity against the Go implementation on the same fixture.
- [ ] Delete `cmd/`, `internal/`, `go.mod`, `go.sum`, `graph.db`, and Go-specific Makefile targets in one commit.
- [ ] Archive the retired GTK-era track folders per `measure/tracks.md`.
- [ ] Update `measure/tech-debt.md` and `measure/lessons-learned.md`.
- [ ] Commit: `chore: Retire the Go implementation`

---

## Phase 10: Optional — Electron wrapper

Only if a desktop window is wanted after the local web app is usable.

- [ ] Wrap the standalone server in an Electron main process.
- [ ] Native file dialogs for project open/import.
- [ ] Package as AppImage.
