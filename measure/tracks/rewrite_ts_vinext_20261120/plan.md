# Plan: TypeScript Rewrite

**Status:** COMPLETE (2026-11-20)
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
- [x] Failing tests: word list parsing, stable ids, and segment grouping by silence gap.
- [x] Failing tests: removing a word or a contiguous range marks exactly those words, idempotently and in word order. (Export-range derivation is Phase 4.)
- [x] Failing tests: undo/redo round-trips the document exactly, and a new edit clears the redo stack.
- [x] Component tests: words render as a labelled region of buttons; a click emits its id and index; shift-click spans a range; removed words are disabled; the active word carries `aria-current`.

**Targeted Red command:**
```bash
npx vitest run packages/core apps/web
```

**Red result:** 3 new files failed on missing modules (`./transcript`, `./history`, `./TranscriptEditor`); the existing 33 tests stayed green.

### Green
- [x] Implement the transcript document and edit operations (pure).
- [x] Implement the transcript editor component with word spans and selection.
- [x] Implement undo/redo.
- [x] Make tests pass.

**Green result:** 62/62 in the targeted run; full suite 85/85; `npm run check` exits 0.
- `transcript.ts`: stable `w0…wN` ids, gap-based segment grouping (0.75 s), `removeWord`/`removeRange` that keep removals ordered and reversible, `keptWords`, and a versioned validating parser.
- `history.ts`: generic `History<T>` with `commit`/`undo`/`redo`. Committing the same reference is a no-op; a new edit clears the redo stack.
- `TranscriptEditor.tsx`: words are real `<button>`s inside a labelled region, so keyboard activation and accessible names come from the platform. Removed words stay in the DOM (disabled, `data-removed`), the active word sets `aria-current`, and shift-click reports an inclusive range.
- Component tests run under jsdom with explicit `cleanup` (Vitest globals are off, so Testing Library's auto-cleanup is not registered).

### Refactor
- [x] Commit: `feat(ui): Add transcript model and word-level editor` — `363c049`

---

## Phase 4: Cut list

### Red
- [x] Failing tests: adjacent kept ranges merge.
- [x] Failing tests: handles and a minimum-gap threshold are applied at boundaries.
- [x] Failing tests: an all-deleted transcript produces an explicit empty result, not a zero-length range.
- [x] Failing tests: serialisation is deterministic across runs.

**Targeted Red command:**
```bash
npx vitest run packages/media
```

**Red result:** `cutlist.test.ts` failed on a missing module; the other 23 media tests stayed green.

### Green
- [x] Implement `buildCutList` as a pure function.
- [x] Make tests pass.

**Green result:** 34/34 in `packages/media`; full suite 96/96; `npm run check` exits 0.
- Signature is `buildCutList({ transcript, durationSeconds, handleSeconds?, minKeepGapSeconds? })`; defaults are a 50 ms handle and a 20 ms minimum kept fragment.
- Removed word intervals expand by the handle (clamped to the media), merge, and the kept list is their complement — so adjacent kept ranges merge for free.
- Kept fragments at or below `minKeepGapSeconds` are folded into the surrounding cut, and `removed` is recomputed from the result so the two lists always agree.
- If every word is removed, the result is an empty `kept` list and one `removed` range covering the media; leaving a trail of inter-word silences would be dead air.
- Every timestamp is rounded to microseconds, so repeated serialisation is byte-stable.

### Refactor
- [x] Commit: `feat(media): Add deterministic cut list builder` — `c48d814`

---

## Phase 5: FFmpeg export

### Red
- [x] Failing tests: the argv builder emits one trim/atrim pair per kept range plus a concat tail (snapshot).
- [x] Failing tests: audio is omitted for a silent source.
- [x] Failing tests: a hostile path stays a single argv entry and never enters the filtergraph.
- [x] Integration test: generate a 10-second synthetic file with FFmpeg, delete a word, export, and assert the duration with ffprobe.
- [x] Failing tests: progress parsing handles split chunks and clamps at 1; a failed export removes the partial output.

**Targeted Red command:**
```bash
npx vitest run packages/media
```

**Red result:** `export.test.ts` and `export.integration.test.ts` failed on a missing `./export`; the 34 existing media tests stayed green.

### Green
- [x] Implement the argv builder (pure) and the runner (injected spawner).
- [x] Implement progress parsing and cancellation.
- [x] Make tests pass.

**Green result:** 47/47 in `packages/media`; full suite 109/109; `npm run check` exits 0. The integration test generates a 10-second 160x120 fixture, exports with one deletion, and asserts duration and stream presence via ffprobe in about 0.9 s.
- `buildExportArgs` trims each kept range, resets PTS, and concatenates in one filter graph. Paths are argv elements only; the filtergraph carries timestamps and labels, never paths.
- `runExport` streams `-progress pipe:1`, buffers partial lines, and removes the partial output on any failure. Cancellation kills the child with `SIGKILL`.
- **Deviation — stream copy is deferred.** Every export re-encodes. `-c copy` can only cut on keyframes, so it needs keyframe probing plus a segment-and-concat path; correctness first. Logged in `tech-debt.md`.

### Refactor
- [x] Commit: `feat(export): Add FFmpeg cut-list export with progress and cancellation` — `7433d9d`

**Exit criteria for parity — this is the gate that unblocks the storyboard track.**

---

## Phase 6: Playback and synchronisation

- [x] Red: binary-search tests for word-at-time, including gaps and boundaries.
- [x] Red: sync hook tests driven by an injected scheduler (advance time → expected active word).
- [x] Green: `<video>` playback with click-to-seek.
- [x] Green: active-word highlighting that updates only when the active word changes.
- [x] Refactor + commit: `feat(ui): Add playback with word synchronisation` — `229f84b`

**Targeted Red command:**
```bash
npx vitest run packages/core apps/web
```

**Red result:** 3 new files failed on missing modules (`./sync`, `./use-playback-sync`, `./PlaybackScreen`); the 62 existing tests stayed green.

**Green result:** 80/80 targeted; full suite 127/127; `npm run check` exits 0.
- `wordIndexAtTime` is an O(log n) binary search returning the last word whose start is at or before the playhead. A silence keeps the previous word active; positions before the first word return -1.
- `useActiveWord` polls once per animation frame through an injectable scheduler, reads the clock through a ref (so an inline `getTime` cannot restart the loop), and only calls `setState` when the active word changes. The transcript is never rebuilt per frame.
- `PlaybackScreen` renders the video and a play/pause control; clicking a word seeks to its start; the active word drives `aria-current` in the transcript.
- Tests run under jsdom with `HTMLMediaElement.play`/`pause`/`currentTime` stubbed and the scheduler advanced manually.

---

## Phase 7: Local API and jobs

- [x] Red: endpoint tests invoking service functions directly (no server, no HTTP objects).
- [x] Red: job lifecycle tests (queued → running → done/failed/cancelled, including illegal transitions).
- [x] Green: `pages/api/` handlers for project, import, probe, export, and job status.
- [x] Green: job registry with progress events, persisted to disk and reconciled on startup (dev HMR resets module state; a killed server orphans its children).
- [x] Refactor + commit: `feat(api): Add job registry and local job endpoints` — `fc1750c`, `1a5bc9c`

**Targeted Red command:**
```bash
npx vitest run packages/core apps/web
```

**Red result:** job and endpoint tests failed on missing modules (`./jobs`, `./jobs-api`, `./project-api`, `./media-api`, `./export-job`); the existing suites stayed green.

**Green result:** 25 core job tests + 24 server tests; full suite 163/163; `npm run check` exits 0.
- `JobRegistry` persists every change through a `JobStore` (memory for tests, atomic JSON file for production), notifies subscribers, and rejects illegal transitions with a typed `JobError`.
- On open, jobs left `running` by a previous process become `failed` with "interrupted by restart". The child process is gone, and silently re-running an export is worse than reporting it.
- `runExportJob` owns the lifecycle: progress writes are serialised through a promise chain, so completion cannot overtake the last progress update. Cancellation is reported as `cancelled`, not `failed`.
- Endpoints: `/api/jobs` (list/create), `/api/jobs/[id]` (get/delete), `/api/projects` (create/open), `/api/media/probe`, `/api/media/import`, `/api/export` (enqueues a job, returns 202).
- Error mapping is centralised: `ProjectError`/`MediaError`/`ProbeError`/`CutListError` → 400, `not-found` → 404, `already-exists` → 409, FFmpeg failure → 502.
- Progress reaches the client by polling `/api/jobs/[id]`. The job event shape is transport-independent, so SSE can replace polling later without an API change.

---

## Phase 8: Provider abstraction

- [x] Red: contract tests for the ASR and LLM interfaces using fakes.
- [x] Green: implement one ASR adapter and one LLM adapter inside `packages/ai`.
- [x] Green: wire transcription into the job registry.
- [x] Refactor + commit: `feat(ai): Add provider interfaces and OpenAI-compatible adapters` — `87841d1`

**Targeted Red command:**
```bash
npx vitest run packages/ai apps/web/server
```

**Red result:** 6 provider assertions failed on missing exports and `./transcribe-job` did not exist.

**Green result:** 8 provider tests + 3 transcription-job tests; full suite 174/174; `npm run check` exits 0.
- `TranscriptionProvider` and `LlmProvider` are the only provider contracts; both are implemented with `fetch` and no vendor SDK, so no SDK can leak past `packages/ai`.
- `createWhisperProvider` posts multipart to `/audio/transcriptions` with `response_format=verbose_json` and `timestamp_granularities[]=word`, normalises `word`/`text`, and surfaces HTTP failures with their status.
- `createChatProvider` posts to `/chat/completions` and rejects responses without message content.
- Both adapters accept `baseUrl`, so any OpenAI-compatible server works; `fetch` and `readFile` are injectable for tests.
- `runTranscriptionJob` stores the transcript only after the provider succeeds, so a failed job never leaves a partial transcript on disk.
- `POST /api/transcribe` returns 503 when `OPENAI_API_KEY` is unset, 202 with a job when it is.

---

## Phase 9: Parity and Go retirement

- [x] Verification: automated end-to-end test covers import → transcript → delete → export on a generated fixture, asserting the exported duration and streams with ffprobe.
- [x] Comparison against the Go implementation: **not performed.** The Go toolchain is not installed in this environment and the implementation has now been removed. Duration and stream presence are asserted directly with ffprobe instead; audio-continuity comparison remains unverified.
- [x] Delete `cmd/`, `internal/`, `go.mod`, `go.sum`, `graph.db`, and the Go Makefile in one commit.
- [x] Archive the retired GTK-era track folders under `superseded_ts_rewrite_20261120_*`.
- [x] Update `measure/tech-debt.md` and `measure/lessons-learned.md`.
- [x] Commit: `chore: Retire the Go implementation`

**Verification result:** `npm run check` exits 0 with 175 tests across 24 files. The end-to-end test (`apps/web/server/e2e.test.ts`) creates a project, copies a 3-second generated fixture into it, writes a transcript, deletes a word, exports through the cut list, and confirms the output duration and audio stream with ffprobe.

**Not verified:** live provider transcription (no API key in this environment), and behavioural parity against the retired implementation (no Go toolchain). Both are reported rather than assumed.

---

## Phase 10: Optional — Electron wrapper

Only if a desktop window is wanted after the local web app is usable.

- [ ] Wrap the standalone server in an Electron main process.
- [ ] Native file dialogs for project open/import.
- [ ] Package as AppImage.
