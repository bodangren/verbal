# Test Strategy: Batch Transcription Queue

Track: `batch_transcription_queue_20260509` | Tech Lead role | Toolchain: Go 1.x, `make go-check`

## 1. Build-Graph Findings (what shaped this strategy)

`build-graph` is a **TypeScript-only** scanner; this repository is pure Go. No `graph.db` exists or is applicable. Graph-Aware Mode is intentionally skipped per skill rules. Structural anchors below were obtained via `grep`/`glob` on the Go tree:

- **Reuse target:** `transcription.Service.TranscribeFile(ctx, path) (*ai.TranscriptionResult, error)` at `internal/transcription/service.go:42` — already accepts `context.Context`, must be the unit of work the batch runner invokes.
- **Persistence anchors:** `db.RecordingService.UpdateTranscriptionStatus` (`internal/db/service.go:81`) and `RecordingRepository` follow scanner+repo pattern (`internal/db/repository.go`); `migrations.go` already owns versioned DDL — new `batch_queue` table MUST go through a new numbered migration, not ad-hoc SQL.
- **Existing call site:** `cmd/.../run.go:829` shows the single-file flow we must preserve unchanged. Caller surface for `TranscribeFile` is small (1 production call + tests), so blast radius for adding a batch caller is low.
- **Provider seam:** `ai.Provider` interface — already abstracted, so batch tests can inject a fake provider with no SDK imports.

## 2. Architecture Guardrails

- No new GStreamer/FFmpeg shellouts outside `internal/transcription` (reuse `extractAudio`).
- No OpenAI/Google SDK imports outside `internal/ai`.
- No GTK widget access from batch goroutines — UI updates **must** route through `glib.IdleAdd` (lessons-learned §Thread Safety).
- All SQLite access opens with `PRAGMA busy_timeout` + WAL (lessons-learned §SQLite Concurrency); the batch worker shares the existing `*db.Database` handle, never opens a parallel connection.
- New `batch_queue` table introduced via numbered migration in `internal/db/migrations.go`; no schema mutation outside that path.
- Sanitize any file path before passing to GStreamer; reject queue items whose paths contain `\n`/`\r` at enqueue time.
- Batch runner accepts `context.Context` end-to-end; cancel must stop the in-flight item cleanly.

## 3. Shared Fixtures & Mocks

- **`tempDB(t)`** helper (already a pattern in `db/*_test.go`) — opens an in-memory or `t.TempDir()` SQLite, runs migrations, returns `*db.Database` + cleanup. Reused by Phase 1 & 2.
- **`fakeProvider`** implementing `ai.Provider` — returns a deterministic `TranscriptionResult` after a configurable delay, plus an error-injection mode. Lives in `internal/transcription/batch/` test file (or a `testutil` subpkg) — **never** in production code.
- **`fakeTranscriptionRunner`** seam injected into `BatchTranscriptionService` so Phase 2 tests don't shell out to `gst-launch-1.0`. Production wiring still uses real `transcription.Service`.
- **Tiny WAV fixture** (≤1s silence) under `testdata/` for any optional integration test that exercises real audio extraction; gated by a build tag or `t.Skip` when `gst-launch-1.0` is absent.

## 4. Cross-Phase Edge Cases & Dependencies

- App restart mid-queue: `status='processing'` rows MUST be reconciled to `pending` on startup (Phase 1 invariant tested; Phase 2 relies on it).
- Cancel races: cancel during `TranscribeFile` must mark item `cancelled`, not `error`.
- File deleted between enqueue and dequeue: item transitions to `error` with a typed reason, queue continues.
- Duplicate enqueue of same `filePath`: define behavior (dedupe vs. allow) in Phase 1 spec test before Phase 2 consumes it.
- Progress callbacks: Phase 2 must guarantee callbacks are fire-and-forget from the worker goroutine; Phase 3 wraps them in `glib.IdleAdd`.
- Library write race: completion path reuses `UpdateTranscriptionStatus` — do not introduce a parallel writer.

## 5. Testing Pyramid Per Phase

| Phase | Unit | Integration | Manual/E2E |
|---|---|---|---|
| 1 Data Model | Heavy: repo CRUD, status transitions, migration up/down | Light: migration applied to fresh DB | — |
| 2 Engine | Heavy: runner FSM with `fakeProvider` | Medium: runner + real repo + fake provider | — |
| 3 UI | Light: dialog wiring, action callbacks (skip on no-display) | — | Heavy: drag-drop, progress bars, cancel |
| 4 Verification | Re-run all | Re-run all | Full smoke per spec AC |

## 6. Per-Phase Test Approach

- **Phase 1 — Repository (live behavior):** TDD `internal/db/batch_queue_repository_test.go`. Cover Enqueue → ListPending order, Dequeue atomicity, UpdateStatus illegal transitions, Cancel idempotency, restart-reconcile. Migration test asserts table shape and that re-running is a no-op.
- **Phase 2 — Engine (live behavior):** TDD `internal/transcription/batch/service_test.go`. Inject `fakeProvider` + real `BatchQueueRepository` (in-memory DB). Assert sequential ordering, progress callback emission, ctx cancel mid-item, error item does not halt queue, completion writes through `UpdateTranscriptionStatus`. **Fakes are limited to provider + clock**; the real `BatchTranscriptionService` is exercised.
- **Phase 3 — UI (artifact + bounded smoke):** Headless GTK tests guarded with `gtk.Init()`+recover (per lessons-learned). Assert action registration, dialog construction, and that a stub queue model drives the sidebar. Live behavior verified manually per `workflow.md` Phase Completion Protocol.
- **Phase 4 — Verification:** `make go-check` is the gate; coverage spot-checked with `go test -cover ./internal/db/... ./internal/transcription/...` (target ≥80% for new code).

## 7. Artifact-Contract vs Live-Behavior Tests

- **Artifact/contract:** migration SQL shape test (Phase 1), action-name registration test (Phase 3) — these only prove wiring, not runtime semantics.
- **Live behavior:** every Phase 1 repo test, every Phase 2 engine test, manual verification in Phase 3. These execute the production code path with only the provider/clock faked.
- Fakes are **never** registered as production gates. The `fakeProvider` lives in `_test.go` files only; `go vet` + `go build ./...` will fail if it leaks into a non-test file.

## 8. Intentionally-Red / Excluded Tests

None planned. If a phase needs a placeholder failing test (e.g., scaffolding Phase 2 before Phase 1 lands), it MUST live behind a Go build tag `//go:build batch_wip` so `make go-test` (no tags) does not pick it up, and the owning task stays `[~]` until the tag is removed in the same commit that turns it green. State explicitly in `plan.md` if introduced.

## 9. Live-Proof Plan (Red → Green/closeout per phase)

| Phase | Targeted Red command | Green / closeout gate |
|---|---|---|
| 1 | `go test ./internal/db/ -run 'TestBatchQueue' -count=1` (must fail: package symbol missing) | Same command green, then `go test ./internal/db/... -count=1` green |
| 2 | `go test ./internal/transcription/batch/ -run 'TestBatchTranscriptionService' -count=1` (must fail) | Same command green, then `go test ./internal/transcription/... -count=1` green |
| 3 | `go test ./internal/ui/ -run 'TestBatchTranscribeAction' -count=1` (must fail; skipped if no display) | Same command green or skipped, plus manual verification per `workflow.md` §Phase Completion |
| 4 | `make go-check` (must be already green from Phase 1–3) | `make go-check` green; `go test -cover` shows ≥80% on new packages; `lessons-learned.md` updated; commit + push |

Each Red command is **bounded by `-run`** to a phase-specific regex so it cannot silently fall through into the full suite. The Green gate explicitly re-runs the broader package and, at closeout, the full `make go-check`, so passing the narrow filter alone is never sufficient to mark a phase complete.

MEASURE_AGENT_RESULT
role: strategy
status: complete
track: batch_transcription_queue_20260509
phase: track setup
commits: none
tests_run: none (strategy doc only; no code changes)
files_changed: measure/tracks/batch_transcription_queue_20260509/test-strategy.md (new)
plan_updates: none — plan.md left untouched per instructions
known_failures: none
handoff: Implementer should start Phase 1 by writing the targeted Red test `go test ./internal/db/ -run 'TestBatchQueue' -count=1`, add a numbered migration for `batch_queue`, and reuse the `tempDB`/scanner patterns already in `internal/db/`. Phase 2 must inject a `fakeProvider` (test-only) and reuse `transcription.Service`; do NOT introduce a second SQLite handle. Build-graph not applicable (Go-only repo); no graph.db created.
END_MEASURE_AGENT_RESULT
