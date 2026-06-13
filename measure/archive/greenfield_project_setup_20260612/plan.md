# Plan: Greenfield Project Setup

**Status:** COMPLETE  
**Created:** 2026-06-12  
**Focus:** Scaffold the new Verbal project structure, domain model, SQLite migrations, app controller, and CI checks.

---

## Phase 1: Domain Model [checkpoint: 8fd119c]

### Red
- [x] Write failing tests in `internal/domain` for `Recording`, `Transcript`, `Word`, and `Segment` construction and validation.

### Green
- [x] Create `internal/domain/recording.go`, `transcript.go`, `word.go`, `segment.go`.
- [x] Implement constructors and accessors.
- [x] Make tests pass.

### Refactor
- [x] Add GoDoc comments for all exported types and methods.
- [x] Commit: `chore(domain): Add core domain model`

---

## Phase 2: SQLite Migrations [checkpoint: 684a285]

### Red
- [x] Write failing tests for migration runner: applies migrations in order, records versions, is idempotent.

### Green
- [x] Create `internal/db/migrations.go` with `Migration` type and `Migrate` function.
- [x] Create `schema_migrations` table.
- [x] Add initial migration for `recordings` and `transcripts` tables.
- [x] Make tests pass.

### Refactor
- [x] Document migration authoring rules.
- [x] Commit: `chore(db): Add versioned SQLite migrations`

---

## Phase 3: Application Controller [checkpoint: db3cd3e]

### Red
- [x] Write failing tests in `internal/app` for controller construction, initialization, and shutdown.

### Green
- [x] Create `internal/app/controller.go` with `Controller` struct.
- [x] Implement `New`, `Initialize`, `Activate`, `Shutdown`, `RunSmokeCheck`.
- [x] Wire domain repositories through controller.
- [x] Make tests pass without requiring a display.

### Refactor
- [x] Ensure `main.go` is reduced to under 100 lines.
- [x] Commit: `chore(app): Add application controller`

---

## Phase 4: Build & Smoke Check [checkpoint: 17543fd]

### Red
- [x] Write failing test that `go run ./cmd/verbal --smoke-check` exits 0.

### Green
- [x] Update `cmd/verbal/main.go` to parse flags and run the controller smoke check.
- [x] Ensure `Makefile` `check` target runs vet, build, and tests.
- [x] Make smoke check pass.

### Refactor
- [x] Verify cold and incremental build times.
- [x] Commit: `chore(build): Add smoke check and CI target`

---

## Phase 5: Final Verification

- [x] Run `make check`. All tests pass.
- [x] Run `go run ./cmd/verbal --smoke-check`.
- [x] Update `measure/tech-debt.md` and `measure/lessons-learned.md` if needed.
- [x] Update this `plan.md` and `measure/tracks.md` with completion status.
- [x] Commit: `measure(plan): Mark greenfield project setup complete`
