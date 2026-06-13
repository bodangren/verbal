# Test Strategy: MVP Library & Export

**Role:** Tech Lead | **Status:** Draft | **Test runner:** `go test` (Go 1.24+)
**Track ref:** [spec.md](./spec.md) · [plan.md](./plan.md)

## 0. Build-graph findings

build-graph is **TypeScript-only** (per the build-graph skill: "TypeScript only (.ts, .tsx)"). This project is Go (`go.mod` + `internal/...`). Graph-Aware Mode is **not applicable**; no `graph.db` exists or should be built. Structural context was instead gathered via `glob`/`grep`/`read` over `internal/`. Key finding: significant scaffolding already exists — `internal/db/repository.go` (List/Update/Delete present), `internal/ui/libraryview.go`, `internal/media/export.go` (SegmentExporter, *not* an original-file copier), `internal/lifecycle/exporter.go` (ZIP-archive exporter, different shape from the planned `media.Exporter`), `internal/settings/{provider,service}.go` (no `paths.go`). Strategy must therefore distinguish *new* contracts (`internal/media/exporter.go`, `internal/settings/paths.go`) from *extensions* of existing files.

## 1. Pyramid per phase

| Phase | Unit | Integration | E2E / Manual |
|---|---|---|---|
| 1 Library Repo | 80% – sql.DB on `t.TempDir()` | 20% – migrations + repo | none |
| 2 Library View | 70% – widget construction, signal emission (headless GTK gated by `XDG_RUNTIME_DIR`/display) | 20% – view + mock repo | 10% manual GTK render |
| 3 Original Export | 80% – buffered copy w/ `os.Pipe`/`bytes.Buffer` | 20% – real temp files, large-file boundary | none |
| 4 UI Wiring | 60% – controller routing w/ fake services | 30% – controller + real repo + fake exporter | 10% manual dialog flow |
| 5 Project Storage | 80% – `t.TempDir()` directory creation | 20% – first-run + Initialize() | none |
| 6 Verification | — | full `make check` | manual checklist from spec AC |

Coverage target: **>80% for new code** in `internal/db`, `internal/media`, `internal/settings`; widget code may be lower where GTK requires a display (skip with `t.Skip` per `tech-stack.md` §Testing).

## 2. Shared fixtures & mocks

- **`db.Database` test factory** — pattern from `repository_test.go:17-30`: `NewDatabase(filepath.Join(t.TempDir(), "test.db"))`. Reuse; do not invent a new harness.
- **`Recording` builder** — small helper in `internal/db/testdata_test.go` (new) returning a populated `*Recording` (status enum: `New|Transcribing|Transcribed|Error` per FR2).
- **Fake `RecordingProvider`** for UI tests — interface defined alongside `LibraryView`; lives in `internal/ui/libraryview_test.go`. Must NOT reuse `lifecycle.MockRecordingProvider` (different shape: `string` IDs vs `int64`).
- **Progress capture** — `func(percent float64, msg string)` recorder slice used in Phase 3 & 4.
- **Filesystem fixtures** — fixed-byte payloads (1 KiB, 5 MiB) under `t.TempDir()`; do **not** check binary fixtures into git.
- **GTK headless gate** — top-of-test helper `requireDisplay(t)` calling `t.Skip` when `DISPLAY`/`WAYLAND_DISPLAY` unset; mirrors existing pattern in `internal/ui/main_test.go`.

## 3. Cross-phase edge cases & dependencies

- Phase 1 → 2/4: `RecordingRepository.Delete` must cascade or be sequenced with media-file removal. Test the **DB-only** delete in P1; test **DB + media-file** delete intent in P4 (FR1 says "optionally the media file" — make this an explicit boolean and test both branches).
- Phase 3 ↔ Phase 5: `media.Exporter` writes to a path produced by Phase 5 `paths.go`. Test Exporter with absolute paths only; never assume project-dir context inside `internal/media`.
- Phase 3 vs existing `internal/media/export.go` (SegmentExporter): the new `media.Exporter` is a **different type** (whole-file copy). Do not extend `SegmentExporter`; new file `exporter.go` + new test file. Confirm naming with team before Red.
- Phase 4: controller already exists (`internal/app/controller.go`). Wiring tests must use the existing `Controller` plus a **new method** (e.g. `ExportRecording`, `DeleteRecording`); avoid renaming existing exported methods (caller blast radius unknown — no graph; grep callers manually before any signature change).
- Phase 5: first-run idempotency — running `Initialize()` twice must not error, must not clobber `verbal.db`.
- Status badge values (`New|Transcribing|Transcribed|Error`) are a contract between Phase 1 (storage) and Phase 2 (display). Define as a typed `RecordingStatus` constant set in P1; UI tests assert on those constants.

## 4. Architecture guardrails (must hold across all phases)

- **No GStreamer in Phase 3 exporter.** Original-file export is a buffered `io.Copy`; pulling in GStreamer would violate Non-Goals and bleed into `Text-Driven Delete` track scope.
- **No direct OpenAI/Google imports** — irrelevant here but enforced by AGENTS.md; UI/export must not import `internal/ai/openai|google`.
- **GTK calls only from main thread**: any progress callback that updates UI MUST be wrapped with `glib.IdleAdd` (per `tech-stack.md` §Concurrency). Tests for `media.Exporter` use a plain channel; the *UI wiring* test (Phase 4) verifies the IdleAdd wrap exists (assert handler invocation count, not direct widget mutation).
- **Path safety:** any user-supplied path crossing into shell/GStreamer must use `internal/media/sanitize.go`. Phase 3 doesn't shell out, but Phase 4 file-chooser output must still be `filepath.Clean`'d before reaching exporter.
- **No new abstraction layers** beyond what spec requires (avoid premature interfaces in `internal/settings/paths.go`).

## 5. Per-phase test approach

- **P1:** Extend `repository_test.go`. Red = add tests asserting `List` ordering by `created_at DESC`, `Delete` removes row, `Update` mutates fields — note several of these already exist; the *new* failing tests must target the gap (e.g. status-enum validation, `ListByStatus` if added). Confirm gap before writing.
- **P2:** New tests in `libraryview_test.go` exercising row count after `SetRecordings`, `connect("row-selected")` emitting an int64 ID, `connect("delete-requested")` emitting an int64 ID. Skip when no display.
- **P3:** New `internal/media/exporter_test.go`. Cases: happy path copy, source-missing error, dest-unwritable error, progress monotonicity (0→100 inclusive), context cancellation mid-copy.
- **P4:** New `controller_export_test.go` / `controller_delete_test.go` using fake exporter and fake repo. Assert intent routing only; do **not** test dialog widgets here.
- **P5:** New `paths_test.go`: directory created with `0755`, `recordings/` subdir, `verbal.db` path returned, second call is no-op.
- **P6:** `make check` is the gate; manual checklist verifies the four spec AC bullets.

## 6. Artifact/contract tests vs live-behavior tests

- **Artifact/contract** (cheap, deterministic, no display, no real media): everything in P1, P3, P5, and the controller-routing tests in P4. These prove *types and wiring*, not user-visible behavior.
- **Live-behavior**: P2 widget render & signal emission (real GTK, gated), P6 manual checklist. These are the only tests that prove the user actually sees a library and a copied file appears at the chosen path.

No fake harness is introduced for production-runner plumbing in this track; tests invoke production code directly via `go test`. If a fake exporter is added in P4 (likely), its production gate (`Controller.ExportRecording`) MUST also be covered by a bounded smoke test that constructs a real `media.Exporter` against a 1 KiB tempfile — this prevents the fake from silently shadowing the real path. The smoke test name MUST start with `TestSmoke_` and must not be excluded from `go test ./...`.

## 7. Live-proof plan (per phase)

| Phase | Targeted Red command (must fail before Green) | Green / closeout gate (must pass at phase end) |
|---|---|---|
| 1 | `go test ./internal/db/ -run TestRecordingRepository_<NewCase> -count=1` | `go test ./internal/db/... -count=1` |
| 2 | `go test ./internal/ui/ -run TestLibraryView_<NewCase> -count=1` (skipped if no display → must run on at least one display-equipped local invocation; CI may skip) | `go test ./internal/ui/... -count=1` |
| 3 | `go test ./internal/media/ -run TestExporter -count=1` | `go test ./internal/media/... -count=1` |
| 4 | `go test ./internal/app/ -run 'TestController_(Export|Delete)' -count=1` **plus** `go test ./internal/app/ -run TestSmoke_ControllerExportLive -count=1` | `go test ./internal/app/... -count=1` |
| 5 | `go test ./internal/settings/ -run TestPaths -count=1` | `go test ./internal/settings/... -count=1` |
| 6 | n/a — verification phase | `make check` (= `go vet ./... && go build ./... && go test ./... -count=1`) + manual AC walkthrough |

`-count=1` defeats the Go test cache and guarantees the Red command actually executes. The phase-end Green gate runs the package suite (not `./...`) to keep failure attribution local; the track-end gate (Phase 6) runs the full suite via `make check`.

## 8. Intentionally-red files & aggregate-suite hygiene

None planned. All Red tests will be authored task-by-task and flipped to Green within the same task per `workflow.md` §3-4. If a tester needs to commit a still-failing test mid-task, it MUST be guarded by `t.Skip("track mvp_library_export_20260612 phase N task in progress")` and the owning task MUST remain `[~]` in `plan.md`; remove the skip in the same commit that flips the task to `[x]`. `make check` runs the full suite, so any unguarded red test would block every other track — do not leave one behind.

MEASURE_AGENT_RESULT
role: strategy
status: complete
track: mvp_library_export_20260612
phase: track setup
commits: none
tests_run: none (strategy-only role; no source modified)
files_changed: measure/tracks/mvp_library_export_20260612/test-strategy.md (new)
plan_updates: none
known_failures: none
handoff: build-graph is TS-only and not applicable to this Go project — graph-aware checks are skipped per skill spec. Significant scaffolding already exists in internal/{db,ui,media,lifecycle,settings}; implementer MUST grep callers before any signature change and MUST NOT extend SegmentExporter for Phase 3 (new exporter.go required). Phase 4 introduces the only fake harness — paired smoke test TestSmoke_ControllerExportLive is mandatory. No intentionally-red files; any in-flight skipped tests must be bound to a [~] task and unskipped in the same commit that closes it.
END_MEASURE_AGENT_RESULT
