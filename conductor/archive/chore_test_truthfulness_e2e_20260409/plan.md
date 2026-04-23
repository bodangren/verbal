# Implementation Plan: Test Truthfulness and Runtime Verification

## Phase 1: Baseline and Inventory
**Goal:** Establish current test/build/runtime baseline and catalog test intent.

### Tasks
- [x] Task: Capture baseline quality gates
  - [x] Run full test suite and capture failures/pass state
  - [x] Run build checks for primary app target(s)
  - [x] Record baseline command evidence for comparison

- [x] Task: Enumerate and map all tests
  - [x] Inventory all `*_test.go` files and test functions
  - [x] Map each test to production behavior/component
  - [x] Flag likely weak-signal tests for deep review

- [x] Task: Conductor - Phase 1 Verification

---

## Phase 2: Test Truthfulness Audit and Corrections
**Goal:** Ensure tests validate real behavior and fail on real regressions.

### Tasks
- [x] Task: Audit and correct weak unit tests
  - [x] Replace tautological/no-op assertions with behavioral checks
  - [x] Tighten mocks/stubs that hide real integration defects
  - [x] Remove or rewrite tests that do not validate observable outcomes

- [x] Task: Strengthen integration boundaries
  - [x] Add/adjust integration tests where unit tests over-mock boundaries
  - [x] Verify critical DB/service wiring with realistic test fixtures
  - [x] Validate error-path behavior that previously lacked assertions

- [x] Task: Conductor - Phase 2 Verification

---

## Phase 3: Build and E2E Smoke Hardening
**Goal:** Add automated checks that catch build/startup/runtime regressions.

### Tasks
- [x] Task: Automate build smoke verification
  - [x] Add repeatable command/test target for app build health
  - [x] Ensure check is CI-friendly and documented

- [x] Task: Add runtime-oriented E2E smoke tests
  - [x] Cover core startup/dependency initialization path
  - [x] Cover at least one critical app flow crossing module boundaries
  - [x] Keep tests deterministic for headless/local execution

- [x] Task: Conductor - Phase 3 Verification

---

## Phase 4: Closure and Risk Documentation
**Goal:** Close the track with clear evidence and residual risk notes.

### Tasks
- [x] Task: Run final validation suite
  - [x] Execute full tests and build checks after changes
  - [x] Re-run targeted E2E smoke tests
  - [x] Confirm no regressions introduced by test hardening

- [x] Task: Document findings and residual risks
  - [x] Summarize corrected misleading tests
  - [x] Document remaining gaps requiring non-headless/manual validation
  - [x] Update track metadata with actual task counts and deviations

- [x] Task: Conductor - Phase 4 Verification

---

## Phase 5: Revalidation Pass (User Request 2026-04-09)
**Goal:** Re-check truthfulness claims against current workspace and prove the app is currently working end-to-end.

### Tasks
- [x] Task: Re-run baseline health checks on current workspace
  - [x] Run `go test ./... -count=1`
  - [x] Run `go build ./...`
  - [x] Run smoke startup verification (`TestE2E_BinaryBuildAndStartupSmoke`)

- [x] Task: Resolve blockers found during revalidation
  - [x] Diagnose root cause for any failing command (no blockers found; all health checks passed)
  - [x] Implement minimal fixes aligned with existing architecture (not required)
  - [x] Add/update tests when behavior contracts are adjusted (not required)

- [x] Task: Conductor - Phase 5 Verification

## Verification Notes (2026-04-09)
- Baseline:
  - `go test ./...`
  - `go build ./...`
- Targeted hardening checks:
  - `go test ./cmd/verbal -run TestE2E_BinaryBuildAndStartupSmoke -count=1`
  - `go test ./internal/media ./internal/sync ./internal/ui -count=1`
- Final full validation:
  - `go test ./... -count=1`
  - `go build ./...`
- Revalidation execution (2026-04-09):
  - `go test ./... -count=1` -> PASS
  - `go build ./...` -> PASS
  - `go test ./cmd/verbal -run TestE2E_BinaryBuildAndStartupSmoke -count=1 -v` -> PASS (`TestE2E_BinaryBuildAndStartupSmoke` in 11.21s)
  - `go run ./cmd/verbal --smoke-check` -> PASS (`smoke-check:ok`)

---

## Phase 6: Workspace Truthfulness Rerun (User Request 2026-04-09)
**Goal:** Prove the app is currently working in this exact workspace state.

### Tasks
- [x] Task: Execute full health checks in current workspace
  - [x] Run `go test ./... -count=1`
  - [x] Run `go build ./...`
  - [x] Run smoke startup verification (`TestE2E_BinaryBuildAndStartupSmoke`)
  - [x] Run direct startup smoke path (`go run ./cmd/verbal --smoke-check`)

- [x] Task: Resolve blockers found during rerun
  - [x] Diagnose root cause for any failing command (no blockers found; all checks passed)
  - [x] Implement minimal fix aligned with existing architecture (not required)
  - [x] Re-run failing command(s) to confirm fix (not required)

- [x] Task: Conductor - Phase 6 Verification

## Verification Notes (Phase 6 rerun - 2026-04-09)
- `go test ./... -count=1` -> PASS
  - `verbal/cmd/verbal` 12.943s
  - `verbal/internal/ai` 6.309s
  - `verbal/internal/db` 0.821s
  - `verbal/internal/media` 1.359s
  - `verbal/internal/settings` 0.014s
  - `verbal/internal/sync` 0.285s
  - `verbal/internal/thumbnail` 0.172s
  - `verbal/internal/transcription` 0.024s
  - `verbal/internal/ui` 0.898s
  - `verbal/internal/waveform` 0.371s
- `go build ./...` -> PASS
- `go test ./cmd/verbal -run TestE2E_BinaryBuildAndStartupSmoke -count=1 -v` -> PASS (`TestE2E_BinaryBuildAndStartupSmoke` in 7.64s)
- `go run ./cmd/verbal --smoke-check` -> PASS (`smoke-check:ok`)
- `timeout 10s go run ./cmd/verbal` -> EXPECTED timeout exit 124 after sustained runtime (no startup crash); observed non-fatal GTK CSS warning about unsupported `overflow` property
