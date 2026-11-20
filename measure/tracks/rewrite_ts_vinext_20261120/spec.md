# Specification: TypeScript Rewrite

## Overview

Replace the retired GTK4/GStreamer/Go application with a local-first TypeScript application: a vinext (Vite) + React front end over a local Node server, with FFmpeg as the media engine, JSON project documents, and Remotion reserved for motion graphics.

This track delivers the **shell and the editing core**. Storyboard and compositing live in `storyboard_compositor_20261120` and are unblocked when this track reaches cut-list export.

Scope: personal, single-user, Linux. No accounts, no telemetry, no cloud sync.

## Goals

1. Define a project format that is human-readable, versioned, diffable, and crash-safe.
2. Import and probe media without a media framework.
3. Edit a transcript at word granularity, with deletions expressed as a cut list rather than as media operations.
4. Export a cut list to a real media file with FFmpeg, stream-copying where the codecs allow it.
5. Play back media with word-level highlighting and click-to-seek.
6. Put ASR and LLM access behind interfaces with exactly one adapter implemented.
7. Reach behavioural parity with the Go application on import → transcript → cut → export, then retire the Go tree.

## Non-Goals

- GTK, GStreamer, Go, or CGo anywhere in the new application.
- Storyboard, compositing, chroma key, and slide rendering (separate track).
- Distribution, packaging, code signing, or Electron (optional follow-up phase).
- Multi-user, cloud project sync, accounts, telemetry.
- Matching the Go application's full feature surface. Features not needed for the core flow are re-planned later.

## Functional Requirements

### FR1: Project format
- A project is a directory containing `project.json`, `transcript.json`, `edit.json`, `assets/`, `cache/`, `exports/`.
- Every document carries a `schemaVersion`.
- Writes are atomic: write to a temp file in the same directory, `fsync`, then rename.
- Opening a document with an unknown or newer `schemaVersion` fails loudly rather than attempting a lossy migration.
- Relative paths only for anything inside the project. The single exception is a referenced asset's absolute `externalPath` (see FR2).

### FR2: Import and probe
- The user imports a media file, choosing copy-into-project or reference-in-place.
- Copy mode stores `media.assetPath` (project-relative) and copies the file under `assets/`.
- Reference mode stores `media.externalPath` (absolute) and copies nothing. A document stores exactly one of the two.
- `ffprobe` supplies duration, stream list, codecs, frame rate, audio channels, and rotation.
- A thumbnail is extracted for the library view.
- Probe failures are reported with the FFmpeg stderr excerpt, not a generic error.

### FR3: Transcript model and editing
- A transcript is an ordered list of word records with `start`, `end`, `text`, and stable IDs.
- Deletions mark words as removed and produce cut-list ranges; they never touch media.
- Undo and redo operate on the document, not on the filesystem.
- Clicking a word seeks the player to that word's start.

### FR4: Cut list
- A cut list is an ordered list of ranges in **source** time: kept or removed, with handles.
- It is derived from the transcript and edit document by a **pure function**.
- Adjacent kept ranges are merged; deleted ranges shorter than a threshold are expanded to avoid clicks.
- The cut list serialises deterministically (stable ordering, no map iteration).

### FR5: Export
- The cut list is translated into an FFmpeg invocation by a **pure function returning an argv array**.
- Stream copy is used when every boundary is keyframe-aligned and codecs permit; otherwise re-encode.
- Progress is parsed from FFmpeg `-progress` output and reported to the UI.
- Export is cancellable; cancelling terminates the child process and leaves no partial output in place.
- No filtergraph string is ever passed through a shell.

### FR6: Playback and synchronisation
- Playback uses the HTML `<video>` element.
- Word lookup uses binary search over word timestamps.
- The active word updates at roughly 10 Hz and must not re-render the whole transcript.
- Seeking is debounced and tolerant of browser seek imprecision.

### FR7: Local API and jobs
- Route handlers under `pages/api/` serve project, import, probe, export, and job status.
- Long-running work runs in a job registry, not inside the request; the client polls or subscribes via SSE.
- Handlers are directly invocable in tests without starting a server.

### FR8: Provider abstraction
- `packages/ai` exposes an ASR interface and an LLM interface.
- Exactly one adapter of each is implemented in this track.
- No vendor SDK is imported outside `packages/ai`.

### FR9: Retirement of the Go tree
- Once Phase 5 reaches parity, `cmd/`, `internal/`, `go.mod`, `go.sum`, `graph.db`, and the Go-specific Makefile targets are removed in a single commit.
- `AGENTS.md` is rewritten for the new stack in Phase 0, before any code is written.

## Acceptance Criteria

- [ ] `npm run check` (typecheck + lint + test + build) passes.
- [ ] A project can be created, imported into, and reopened after a simulated crash with no data loss.
- [ ] An unknown `schemaVersion` refuses to open with a clear message.
- [ ] Deleting words produces a cut list whose kept ranges sum to the expected duration.
- [ ] Exporting a synthetic 10-second fixture with two deletions produces a file of the expected duration, verified by `ffprobe`.
- [ ] Export progress reaches 100% and cancelling mid-export leaves no partial output.
- [ ] Clicks on a transcript word seek the player within tolerance.
- [ ] The active word highlights during playback without re-rendering the transcript.
- [ ] `rg "gotk4|gstreamer|package main"` finds nothing in the new tree.
- [ ] Unit tests run in under 10 seconds with no display, GPU, or network.

## Non-Functional Requirements

- **NFR1 No shell interpolation:** subprocesses are spawned with argv arrays; `shell: true` is forbidden.
- **NFR2 Path safety:** every user-supplied path is resolved and validated before reaching FFmpeg.
- **NFR3 Determinism:** pure builders are snapshot-tested; identical documents yield identical argv.
- **NFR4 Crash safety:** atomic writes on every document mutation.
- **NFR5 Test speed:** no test requires media hardware or a browser window.
- **NFR6 Zero native modules:** the default install has none. If `node:sqlite` is insufficient, any native dependency is confined to server code and never imported by a component.

## Dependencies

- Node.js 24 and npm.
- `ffmpeg` and `ffprobe` on `PATH` (detected at startup; a missing binary produces actionable guidance).
- Remotion is **not** a dependency of this track.

## Risks

- **R1 — Filtergraph escaping.** FFmpeg's filter syntax has its own quoting rules; a naive string builder is an injection surface. Mitigation: argv arrays and a dedicated escaper with tests.
- **R2 — Cut accuracy.** Stream copy can only cut on keyframes. Mitigation: detect keyframe alignment with `ffprobe` and fall back to re-encode at non-aligned boundaries.
- **R3 — HTML5 seek precision.** Browsers seek imprecisely. Mitigation: tolerance-based assertions and a scrub-free sync loop.
- **R4 — vinext maturity.** It is under active development. Mitigation: Pages Router, no RSC, no platform-specific features; the vendor surface used is small enough to migrate to plain Vite if needed.
- **R5 — Scope.** The retired app had 50k LOC of features. Mitigation: this track stops at parity for the core flow; everything else is re-planned.
