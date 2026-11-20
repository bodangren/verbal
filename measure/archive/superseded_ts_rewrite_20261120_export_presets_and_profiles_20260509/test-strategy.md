# Test Strategy: Export Presets and Profiles

Tech Lead notes for the four-phase plan. Keep tests TDD (Red → Green) and respect Verbal's headless-CI constraints (skip on GTK panic, mock GStreamer pipelines).

## 1. Testing Pyramid by Phase

| Phase | Unit (majority)                                    | Integration (small)                              | Manual / E2E              |
|-------|----------------------------------------------------|--------------------------------------------------|---------------------------|
| 1     | `PresetRepository` CRUD, validators, seed logic    | Migration + seed against in-memory SQLite        | —                         |
| 2     | Dialog preset binding, codec→stream-copy mapping   | Dialog↔Repository wiring (mock repo)             | One-shot dry-run export   |
| 3     | Settings panel preset list model, edit/delete FSM  | SettingsWindow↔Repository (read-only built-ins)  | GNOME visual verification |
| 4     | n/a — aggregate gate                               | `make go-check` aggregate                        | Run app, export YouTube   |

Target ≥80% line coverage on `internal/db/preset_repository*.go` and the new export-dialog preset glue.

## 2. Shared Fixtures & Mocks

- `internal/db/testdb.go`-style helper: `newTestDB(t)` returning a migrated SQLite DB and `t.Cleanup` deletion. Reuse the existing pattern from `migrations_test.go` and `settings_repository_test.go`.
- Built-in preset golden table: a single `[]Preset` literal in `preset_repository_test.go` (YouTube 1080p, Podcast Audio, Archive, Web Preview) — used by both seed tests and dialog tests via an exported test helper `BuiltinPresetsForTest()`.
- `fakeCodecDetector` returning a chosen `CodecInfo` so dialog tests can assert stream-copy decision without GStreamer.
- GTK tests follow the existing `gtk.Init()` + recover/`t.Skip("No display available")` idiom from `exportdialog_test.go:13`.

## 3. Cross-Phase Edge Cases & Dependencies

- **Schema versioning:** Phase 1 must add a *new* migration version (append-only — see `internal/db/migrations.go:20-22` comment). Never edit existing versions.
- **Seed idempotency:** Seeding must be safe across app restarts (UPSERT-by-name) and must not overwrite a user-edited custom preset that happens to share a name → built-ins must use a `is_builtin` flag column.
- **Built-in immutability:** Phase 3 delete/edit must reject `is_builtin=1` rows at repository level (defence in depth) and at UI level (greyed buttons).
- **Stream-copy gating:** Phase 2 must reuse `CodecInfo.CanStreamCopy()` (see `internal/media/export.go:81-88`); preset's declared codec is compared to detected source codec — mismatch forces re-encode.
- **Path safety:** Preset names flow into no shell/pipeline strings, but the destination path still does — keep `escapeFilePath` behaviour unchanged (Lessons Learned §"GStreamer Path Safety").
- **Concurrent SQLite:** Tests must rely on existing `PRAGMA journal_mode=WAL` + `busy_timeout` defaults set in `db.Open` (Lessons Learned §"SQLite Concurrency").

## 4. Architecture Guardrails

- New code lives in `internal/db/preset_repository.go` and `internal/ui/exportdialog.go` (extension only). No new top-level packages.
- No direct GStreamer or FFmpeg calls from `internal/db` or preset model code.
- No OpenAI/Google SDK imports anywhere in this track (provider-agnostic rule).
- All goroutines touching GTK must use `glib.IdleAdd` (Lessons Learned §"Thread Safety"). Preset save from dialog goes through repository on the calling goroutine — no new threads needed.
- Migrations append-only; `migrations_compat_test.go` must continue to pass (proves no version reuse).

## 5. Per-Phase Test Approach

- **Phase 1 — Repository (TDD):** Red-first table-driven tests for `Create`, `GetByID`, `GetByName`, `List`, `Update`, `Delete`, `SeedBuiltins`. Validate invariants: name uniqueness, container ∈ {mp4, mkv, webm, wav, m4a}, bitrate>0, built-ins read-only at repo layer.
- **Phase 2 — Dialog Integration:** Unit-test the preset→pipeline-config translator pure function separately from the GTK widget. Widget tests assert dropdown population, default selection, and that "Save as Custom Preset" calls repo with correct fields. Stream-copy decision is a pure function under unit test using `fakeCodecDetector`.
- **Phase 3 — Settings Panel:** Test list model contents (built-ins first, custom after), and that delete/edit are blocked for built-ins (both at action handler and via repo error). Visual check is manual but covered by an existing settings-window smoke pattern.
- **Phase 4 — Verification:** `make go-check` aggregate plus a manual export run with each built-in preset on a real H.264 sample (stream-copy path) and a forced re-encode case.

## 6. build-graph Findings

`build-graph` is installed (`/home/daniel-bo/.local/bin/build-graph`) but `graph.db` is **0 bytes** and Verbal is a **Go** project — the tool is **TypeScript-only** (skill §Limitations). Per Measure Graph-Aware Mode contract, this is a documented skip, not a failure. Structural facts were instead gathered via `grep`/`glob`:

- Migration registry: `internal/db/migrations.go:22` (`var migrations = []Migration{...}` — append-only).
- Stream-copy seam: `internal/media/export.go:81` (`canStreamCopy`) → `CodecInfo.CanStreamCopy` referenced from `internal/media/codec_test.go:34`.
- Export dialog seam: `internal/ui/exportdialog.go:50` (`NewExportDialog`) — extension point for preset dropdown.
- Settings repo pattern: `internal/db/settings_repository.go:28` (`CreateSettingsSchema`) — template for the preset repository's interface shape.

These four files are the *only* production files this track may touch (plus their new siblings). Any change outside them is out of scope.

## 7. Live-Proof Plan (Targeted Red & Green/Closeout Gates)

Each phase has a **bounded, targeted** Red command (proves the new failing test actually runs) and a **bounded** Green command (proves it now passes without falling through to the full suite). The Phase 4 aggregate gate is the only place `make go-check` runs.

| Phase | Targeted Red command                                                                 | Green / closeout gate                                                                 | Live vs. contract |
|-------|--------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|-------------------|
| 1     | `go test ./internal/db/ -run TestPresetRepository -count=1 -v` (must FAIL: no impl)  | `go test ./internal/db/ -run 'TestPresetRepository\|TestMigrationVersions' -count=1`  | **Live** — real SQLite, real migration runner. |
| 2a    | `go test ./internal/ui/ -run TestExportDialogPreset -count=1 -v` (must FAIL)         | `go test ./internal/ui/ -run TestExportDialogPreset -count=1`                         | **Live UI** for dialog wiring (skips on no-display); **contract** for codec→preset mapping pure-function test. |
| 2b    | `go test ./internal/media/ -run TestPresetToPipelineConfig -count=1 -v` (must FAIL)  | `go test ./internal/media/ -run 'TestPresetToPipelineConfig\|TestSegmentExporter_canStreamCopy' -count=1` | **Live** pure-function + existing canStreamCopy live unit. A **bounded smoke** (`go test ./internal/media/ -run TestExport_StreamCopy_WithPreset -count=1 -short`) constructs a real GStreamer pipeline string and asserts shape — no actual encoding. |
| 3     | `go test ./internal/ui/ -run TestSettingsPresetPanel -count=1 -v` (must FAIL)        | `go test ./internal/ui/ -run TestSettingsPresetPanel -count=1` + manual GNOME check   | **Live UI** (skips headless); built-in immutability is a **contract test** at repository layer. |
| 4     | n/a (no new tests; integration gate)                                                 | `make go-check` (vet + build + full test) **and** manual export of one H.264 source with YouTube 1080p preset → assert stream-copy path taken (log-line check) | **Live end-to-end.** |

**Fake harness policy.** No fake harnesses are introduced for runner plumbing in this track — all phases use real `*sql.DB` (in-memory SQLite) and the existing GTK skip-on-panic pattern. `fakeCodecDetector` is a test double for an *input boundary*, not a runner; the production gate it covers (stream-copy decision) is also exercised by the bounded smoke in Phase 2b which constructs the real pipeline string. There is no path by which a fake substitutes for a production gate command.

**Aggregate-suite hazards.** No intentionally-red test files are introduced. Red tests during Phases 1–3 belong to in-progress `[~]` tasks and are converted to Green within the same phase before commit. If a phase must be paused mid-Red, the failing test file is annotated with `t.Skip("WIP: track export_presets_and_profiles_20260509 phase N — owned by [~] task")` and the corresponding plan task remains `[~]` until the skip is removed. The Phase 4 `make go-check` will therefore never observe a stranded red test.

MEASURE_AGENT_RESULT
role: strategy
status: complete
track: export_presets_and_profiles_20260509
phase: track setup
commits: none
tests_run: none (strategy-only; no implementation)
files_changed: measure/tracks/export_presets_and_profiles_20260509/test-strategy.md (new)
plan_updates: none — strategy document only; plan.md untouched
known_failures: none
handoff: Implementer should start Phase 1 with the targeted Red command `go test ./internal/db/ -run TestPresetRepository -count=1 -v`. Append a new migration version (do not edit existing) and add `is_builtin` column. graph.db is empty and project is Go — Graph-Aware Mode is documented-skipped per build-graph TS-only limitation; rely on grep/glob for structural questions. Only four production files are in scope: internal/db/migrations.go, new internal/db/preset_repository.go, internal/ui/exportdialog.go, and (Phase 3) internal/ui/settingswindow.go.
END_MEASURE_AGENT_RESULT
