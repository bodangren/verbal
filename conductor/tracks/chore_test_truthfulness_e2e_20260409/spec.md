# Specification: Test Truthfulness and Runtime Verification

## Overview
Test coverage percentages currently look healthy, but build and runtime confidence are lower than expected. This track hardens confidence by auditing every existing test for behavioral validity and adding pragmatic end-to-end smoke verification that the app can build and start with critical dependencies wired.

## Functional Requirements

1. **Full Test Inventory and Intent Mapping**
   - Enumerate all test files and test cases under the Go codebase.
   - Document what each test claims to validate and which production behavior it exercises.

2. **Test Truthfulness Audit**
   - Identify tests with weak or misleading assertions, excessive mocking, or disconnected setup that can pass while real behavior is broken.
   - Fix misleading tests or replace them with behavior-focused assertions.
   - Remove or rewrite tests that provide no meaningful signal.

3. **Build and Startup Verification**
   - Add automated verification that the primary application target builds successfully.
   - Add a smoke path that validates startup wiring at least through dependency initialization and main-window composition paths that can run in CI/headless contexts.

4. **Runtime-Oriented E2E Coverage**
   - Add end-to-end tests for critical user journey(s) with realistic repository/service boundaries.
   - Ensure E2E tests fail on genuine wiring regressions that unit tests can miss.

5. **Audit Output**
   - Record findings, fixes, and residual risks in track artifacts.
   - Clearly distinguish fixed issues from remaining constraints (for example, hardware/display-bound validation).

## Non-Functional Requirements

1. **Reliability**
   - New tests must be deterministic and stable across repeated runs.
   - Avoid brittle timing assumptions and sleep-based flake patterns where possible.

2. **Performance**
   - Standard test suite runtime should remain reasonable for local development workflows.
   - E2E smoke coverage should prioritize high-value paths over exhaustive UI permutations.

3. **Architecture Compliance**
   - Keep provider abstraction boundaries intact (no direct OpenAI/Google SDK usage outside AI provider module).
   - Keep media-path testing aligned with GStreamer-centric architecture.

## Acceptance Criteria

- [ ] Every existing test file has been reviewed for claim-vs-behavior validity.
- [ ] Identified misleading tests are fixed, replaced, or explicitly documented with rationale.
- [ ] `go test ./...` passes after test hardening changes.
- [ ] App build verification is automated and passing.
- [ ] New E2E smoke coverage exists for core startup/runtime wiring.
- [ ] Track plan and verification notes reflect actual executed commands and outcomes.

## Out of Scope

- Full GUI automation of every GTK interaction under real display hardware.
- Exhaustive media codec compatibility matrix testing.
- Product feature additions unrelated to test signal quality.
