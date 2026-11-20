# Plan: TypeScript Rewrite

**Status:** PLANNED
**Created:** 2026-11-20
**Focus:** Replace the GTK/GStreamer/Go application with vinext + React + FFmpeg.

> **Rule for this track:** port concepts, not code. The Go implementation is a specification.

> **Check command:** `npm run check` (typecheck + lint + test + build). This replaces `make check`.

---

## Phase 0: Scaffold and decision lock

- [x] Rewrote `AGENTS.md` for the new stack (TypeScript, vinext Pages Router, FFmpeg argv, Measure workflow retained) **before** any code.
- [x] Scaffolded the Pages Router app manually at `apps/web`. `create-vinext-app` only emits the App Router, so the app was built by hand with `pages/`, `pages/api/`, `vite.config.ts`, and `next.config.mjs` (`output: "standalone"`).
- [x] Enabled TypeScript `strict`, ESM, and path aliases for `packages/*`.
- [x] Added Vitest 5, Testing Library, jsdom, ESLint 10 (flat config), and Prettier 3.
- [x] Added `npm run check` = `tsc --noEmit && eslint . && vitest run && vite build`.
- [x] Created the package layout: `apps/web`, `packages/{core,media,storyboard,slides,ai}`. (`tools/remotion` arrives with the storyboard track.)
- [x] Added an FFmpeg/ffprobe presence check (`packages/media/src/system.ts`) surfaced at `/api/system` with actionable UI guidance.
- [x] Recorded the dev and prod commands below.

**Commands:**
```bash
npm install
npm run dev      # vinext dev server with HMR
npm run check    # typecheck + lint + test + build
npm run build    # emits apps/web/dist/standalone/
cd apps/web && PORT=3000 node dist/standalone/server.js
```

**Package manager:** npm workspaces. pnpm could not create its store in the sandbox used for this phase; `package.json` `workspaces` is the source of truth and `pnpm-workspace.yaml` is retained for compatibility.

**Exit criteria:** met — `npm run check` exits 0 with 5 tests passing, and the standalone server served `/` and `/api/system` with FFmpeg 8.0.1 detected. Commit: `feat(scaffold)` (see git history).

---

## Phase 1: Project format and storage

Package: `packages/core`.

### Red
- [x] Failing tests: `project.json` validates against its schema; missing required fields are rejected.
- [x] Failing tests: unknown `schemaVersion` is rejected with a typed error.
- [x] Failing tests: atomic write leaves the previous file intact when the write fails midway.
- [x] Failing tests: corrupt JSON produces a typed parse error, not a crash.
- [x] Failing tests: persisted paths are relative and reject absolute paths and `..` traversal.

**Targeted Red command:**
```bash
npx vitest run packages/core
```

**Red result:** 3 test files, 29 tests — all failed on missing modules (`./paths`, `./atomic`, `./project`).

### Green
- [x] Implement document schemas and validators (`project.ts`, `errors.ts`).
- [x] Implement atomic write (`temp` + `fsync` + `rename`) with an injectable `FileSystem`.
- [x] Implement project creation and open.
- [x] Make tests pass.

**Green result:** 29/29 pass in `packages/core`; full suite 34/34; `npm run check` exits 0. `ProjectError` carries a typed `code` (`invalid-json`, `unsupported-version`, `invalid-document`, `invalid-path`, `not-found`, `already-exists`). Paths are normalised and proven to stay inside the project root. `createProject` refuses to overwrite an existing project.

### Refactor
- [x] Commit: `feat(core): Add project documents and atomic storage` — `672dfd4`

---

## Phase 2: Import and probe

Package: `packages/media`, plus a route handler.

### Red
- [x] Failing tests: `ffprobe -print_format json` output parses into a typed `MediaInfo` from recorded fixtures (video+audio, audio-only, odd frame rates, rotated).
- [x] Failing tests: a probe failure surfaces the FFmpeg stderr excerpt.
- [x] Failing tests: copy-import and reference-import produce the expected project layout.

**Targeted Red command:**
```bash
npx vitest run packages/media
```

**Red result:** 3 new test files (probe, import, thumbnail) failed on missing modules; the existing `system.test.ts` stayed green.

### Green
- [x] Implement the ffprobe runner behind the injected `CommandRunner` interface (`exec.ts`).
- [x] Implement import (copy vs reference) and thumbnail argv construction.
- [x] Make tests pass.

**Green result:** 56/56 tests pass (core 33, media 23); `npm run check` exits 0.
- `probe.ts` parses duration, format, size, stream kinds, fractional frame rates (`30000/1001` → 29.97), channel counts, sample rates, and rotation from side data or tags. A probe failure carries ffprobe's stderr.
- `import.ts` supports copy (writes under `assets/`, returns a project-relative `assetPath`, refuses to overwrite) and reference (copies nothing, returns an absolute `externalPath`, requires an absolute source). File names containing a path are rejected.
- `thumbnail.ts` builds an argv array; paths are never joined into a shell string.
- **Spec refinement:** `ProjectMedia` now accepts exactly one of `assetPath` (relative, copy) or `externalPath` (absolute, reference). The reference case is the single sanctioned absolute path in a project document; everything else stays relative.

### Refactor
- [x] Commit: `feat(media): Add ffprobe parsing, media import, and thumbnail args` — `5ac23ca`

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
