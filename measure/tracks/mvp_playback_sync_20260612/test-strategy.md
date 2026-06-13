# Test Strategy: MVP Playback & Sync

**Tech Lead:** strategy role | **Track:** `mvp_playback_sync_20260612`

## 0. Build-Graph Findings

- `graph.db` exists (mtime 2026-06-13, ~1d) but reports only 7 files / 22 edges and 0 imports — the project is **Go**, and `build-graph` is TypeScript-only. Stats and `search` for `Player`/`Controller`/`TranscriptView` returned no nodes. **Note: Graph-Aware Mode skipped — codebase is Go, build-graph cannot supply blast radius.** Re-running `build-graph scan` would not help. We rely on `rg` for structural facts instead.
- `rg` survey of HEAD reveals significant pre-existing surface this track must integrate with rather than replace:
  - `internal/media/playback.go` already has `PlaybackPipeline{Play,Pause,Stop,SeekTo,QueryPosition,QueryDuration,GetState,Close}` — Phase 1's `Player` interface MUST be modeled to match this shape so Phase 2's GStreamer impl is a thin adapter.
  - `internal/sync/controller.go` already exposes `Controller.GetCurrentWordIndex(position)` (binary search) plus `RegisterPositionCallback`/`RegisterWordChangeCallback` — Phase 4 should extend, not duplicate. Spec FR3's "10 Hz polling" is currently push-driven via `UpdatePosition`; the new Phase 4 polling loop must wrap a `Player` and call `UpdatePosition` itself.
  - `internal/ui/playbackwindow.go` (`PlaybackWindow`) and `internal/ui/transcriptionview.go` (`TranscriptionView`) exist — the spec's `ui.TranscriptView` (Phase 3) and `ui.PlaybackScreen` (Phase 5) are NEW types layered above. Plan `Refactor` steps must call out the relationship to avoid drift.
  - `internal/app/run.go` already builds a `gtk4paintablesink` and pipes `glib.IdleAdd` callbacks — Phase 5 wires through this, not in parallel.

## 1. Testing Pyramid (per phase)

| Phase | Unit (fast, headless) | Integration | Manual / display |
|---|---|---|---|
| 1 Player iface | Contract tests against `fakePlayer`; compile-time `var _ Player = (*fakePlayer)(nil)` and `var _ Player = (*PlaybackPipeline)(nil)` (smoke). | — | — |
| 2 GStreamer player | Pipeline-string construction (pure-fn); state-machine table tests with mock bus. | `TestSmoke_GstPlayer_Constructs` builds a real pipeline against a tiny fixture, gated by `hasDisplay()`. | Wayland/X11 manual seek-latency check (<100 ms). |
| 3 TranscriptView | Word-list model tests (pure data); `OnWordClicked` callback dispatch. | Display-gated render test. | Visual review of flow layout. |
| 4 SyncController | Binary-search edge tests (empty, single word, gap, past end); `glib.IdleAdd` dispatcher fake. | 10 Hz polling loop with `fakePlayer` + virtual clock. | — |
| 5 PlaybackScreen | Wiring tests with stubs for player/view/controller; keyboard shortcut handler tests. | Display-gated end-to-end click-word-then-highlight-follows. | Manual: keyboard, click-to-seek, highlight tracking. |
| 6 Verification | `make check` | — | Full-flow walkthrough per spec AC. |

Target: ≥80 % unit coverage in `internal/media`, `internal/sync`; UI packages aim for compile-time contract tests + behavioural tests where headless-feasible.

## 2. Shared Fixtures & Mocks

- **`fakePlayer`** (Phase 1, lives in `internal/media/player_fake.go` or `*_test.go`): in-memory `Player` with scriptable position, error injection, state observer. Reused unchanged by Phases 4 and 5. **Compile-time assertion `var _ Player = (*fakePlayer)(nil)` and a paired `var _ Player = (*PlaybackPipeline)(nil)` smoke prevent the fake from drifting from production.** (Lessons §"Mandatory Smoke Test for Cross-Package Fakes".)
- **`fakeIdleScheduler`** (Phase 4): wraps `glib.IdleAdd` behind a function field so tests run synchronously without GTK. Production wiring uses `glib.IdleAdd` directly.
- **Word-list fixture builder**: small helper producing `[]ai.Word` with monotonic timestamps, plus pathological cases (zero-duration word, overlapping words, single word). Reused by Phases 3, 4, 5.
- **Tiny media fixture**: pre-existing 1 s silent WAV in `testdata/`. Used only by display-gated `TestSmoke_GstPlayer_*`.

## 3. Cross-Phase Edge Cases & Dependencies

- Position past last word's end → `GetCurrentWordIndex` returns last index (already covered in `controller_test.go`; re-verify under new `Player` poll loop).
- Position before first word → returns -1; UI must clear highlight, not crash.
- Empty transcript (no words) → controller no-ops; TranscriptView renders empty state.
- Click-to-seek on the **current** word → must still call `Player.Seek` (idempotent path). Verifies wiring direction.
- Concurrent `UpdatePosition` from poller while user clicks a word: callbacks must serialize via `glib.IdleAdd`.
- Phase 1 `Player.Seek` semantics (accurate vs. key-frame) must be defined in the interface contract test, otherwise Phase 2 is free to pick the wrong flag.
- Phase 4 polling must stop on `Player.Stop()` / `Close()` — leaked goroutine test required (use `goleak` or explicit done-channel assertion).

## 4. Architecture Guardrails

- **No GTK in `internal/media` or `internal/sync` test bodies** — these layers must remain headless-testable. UI packages are the only place `hasDisplay()`-gated tests live.
- **No direct `playbin3` / `gst` imports in `internal/sync` or `internal/ui`** — only `internal/media` constructs pipelines.
- **`Player` interface stays in `internal/media`**; sync and ui depend on the interface, never on `*PlaybackPipeline` or `*GstPlayer`.
- **Path safety**: any path reaching `gst_player.go` MUST go through `internal/media/sanitize.go` (lessons §"GStreamer Path Safety").
- **`glib.IdleAdd` for every UI dispatch** from goroutines (lessons §"Thread Safety"). Sync controller MUST NOT touch widgets directly.
- **Compile-time interface assertions** (`var _ Player = (*GstPlayer)(nil)`, etc.) in each implementer's test file (lessons §"Compile-Time Interface Assertions").

## 5. Per-Phase Test Approach Notes

- **P1**: Pure interface + fake. Red writes contract tests using a not-yet-existing `fakePlayer`; STUB block in test file declares the expected `Player` interface so the package keeps compiling (lessons §"STUB-Block Test File").
- **P2**: Split tests into pipeline-construction (string output, no GStreamer init — fast, always run) and `TestSmoke_GstPlayer_*` (real pipeline, gated, NEVER skipped silently — uses `t.Skip` only when `hasDisplay()` is false).
- **P3**: Decouple word-list model from widget. Test the model exhaustively headless; gate only `Widget()` rendering tests.
- **P4**: Use `fakePlayer` + virtual ticker (channel-driven, not `time.Sleep`). Assert highlight callback fires exactly once per word transition. Add a `TestController_Stop_NoLeakedGoroutine`.
- **P5**: Wiring test constructs `PlaybackScreen` with stubs for all three collaborators and asserts callback graph is correct. Display-gated tests live in `playback_screen_display_test.go` with `//go:build` tag or `hasDisplay()` skip.
- **P6**: `make check` is the gate; manual checklist tracked in plan §6.

## 6. Artifact vs. Live-Behaviour Tests

- **Artifact / contract tests** (always run, fast): interface compile-time assertions, pipeline-string snapshot tests, word-list model tests, controller binary-search tests. These prove **shape**, not runtime behaviour.
- **Live-behaviour tests** (gated, but explicitly enumerated): `TestSmoke_GstPlayer_PlaysOneSecond`, `TestSmoke_PlaybackScreen_HighlightFollowsRealPlayer`. These are the ONLY tests that prove the pipeline + sync actually run end-to-end against real GStreamer/GTK.
- Fakes (`fakePlayer`, `fakeIdleScheduler`) are permitted **for runner plumbing only**. Every production gate command they cover must also have a corresponding `TestSmoke_*` proving the real type satisfies the same contract — see live-proof plan below.

## 7. Live-Proof Plan (Red command → Green/closeout gate)

| Phase | Targeted Red command | Green/closeout gate |
|---|---|---|
| 1 | `go test ./internal/media -run 'TestPlayerContract\|TestSmoke_PlaybackPipeline_SatisfiesPlayer' -count=1` | `make go-test PKG=./internal/media` clean (incl. compile-time `var _ Player = (*PlaybackPipeline)(nil)`). |
| 2 | `go test ./internal/media -run 'TestGstPlayer\|TestSmoke_GstPlayer_PlaysOneSecond' -count=1` | `make go-check` clean; smoke test runs (or skips with explicit `t.Skipf("no display: %v", err)` — never silent). |
| 3 | `go test ./internal/ui -run 'TestTranscriptView' -count=1` | `make go-test PKG=./internal/ui` clean; word-click model test passes headless. |
| 4 | `go test ./internal/sync -run 'TestController_Poll\|TestController_Stop_NoLeakedGoroutine' -count=1` | `make go-test PKG=./internal/sync` clean; no goroutine leak. |
| 5 | `go test ./internal/ui -run 'TestPlaybackScreen_Wiring\|TestSmoke_PlaybackScreen' -count=1` | `make go-check` clean; manual click-to-seek + highlight verified. |
| 6 | `make check` | All packages green; manual AC walkthrough recorded in plan §6. |

`make go-test` and `make check` are aggregate suites — they will discover every test in the repo. To prevent unintentional Red bleed-through:

- **Intentionally-red files during a phase MUST live behind a still-`[~]` task.** A Red phase that introduces a STUB block (per lessons §"STUB-Block") keeps the package compiling; failing assertions are scoped to a `t.Run` whose name is the still-`[~]` task. No `// +build red` tags, no skipped files outside this rule.
- **No intentionally-red files are expected to survive across phase boundaries** in this track. If one does (e.g., Phase 4 lands before Phase 5), the owning `[~]` task in `plan.md` must name the failing test by exact `TestName/subtest` so aggregate `make go-check` failure is traceable to one open task.
- Bounded smoke tests (`TestSmoke_*`) cover every fake-backed gate command. They are **not** excluded from `go test ./...`; they either pass or skip with a printed reason — they cannot fall through silently into the broader suite.

## 8. Risks & Open Questions

- Spec says "use `playbin3` or custom decodebin" — Phase 2 plan should pick one in its Red sub-task; testing strategy assumes a single implementation per phase.
- Existing `sync.Controller` already implements binary search; Phase 4 may be smaller than the plan implies — recommend the implement role audits HEAD before writing Red, and either extends in place or documents the new wrapper's reason.
- `ui.TranscriptView` (Phase 3) overlaps with `ui.TranscriptionView` and `ui.EditableTranscriptionView`; spec naming should be reconciled in Phase 3 Red to avoid duplicate widgets.

MEASURE_AGENT_RESULT
role: strategy
status: complete
track: mvp_playback_sync_20260612
phase: track setup
commits: none
tests_run: none (strategy role; no implementation)
files_changed: measure/tracks/mvp_playback_sync_20260612/test-strategy.md (new)
plan_updates: none — strategy doc only; flagged 3 risks (existing PlaybackPipeline shape, existing sync.Controller binary search, TranscriptView vs TranscriptionView naming) for the implement role to reconcile in each phase's Red.
known_failures: none
handoff: build-graph is unusable here (Go project; graph.db reports 7 files only) — Graph-Aware Mode is OFF for this track; rely on `rg` for blast radius. Phases 1-5 each have a named targeted Red command and Green gate; smoke tests pair every fake. Implement role should audit existing `media.PlaybackPipeline` and `sync.Controller` BEFORE Phase 1/4 Red to decide adapter-vs-extend, and reconcile `TranscriptView` naming with the existing `TranscriptionView` in Phase 3.
END_MEASURE_AGENT_RESULT
