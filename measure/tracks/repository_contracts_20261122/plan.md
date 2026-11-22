# Plan: Repository Contracts and Verification

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Make setup, tests, documentation, and repository assets describe the same application.

**Check command:** `npm run format:check`, `npm run check`, `npm run e2e`, and the required offline media gate.
**Dependencies:** Final acceptance follows the other five improvement tracks.

---

## Phase 1: Bootstrap and architecture guards

### Red

- [ ] Add a failing clean-setup check for renderer dependency resolution.
      File: `tools/e2e/bootstrap-check.mjs` (new).
      Use existing lockfiles; do not download Chromium or model weights.
- [ ] Add failing architecture fixtures for vendor imports, Node imports in client roots, and shell execution.
      Files: `tools/contracts/architecture.test.ts` (new), `vitest.config.ts`.
- [ ] Add a failing tool-typecheck fixture before expanding the TypeScript gate.
      Files: `tools/remotion/tsconfig.json`, `tools/contracts/tool-check.test.ts` (new).
- [ ] Record the existing formatting failure and dependency advisory before changing their configuration.
      Files: `package-lock.json`, `.prettierrc.json`, `.prettierignore`.
      Trace `vinext` → `@vercel/og` → `satori` → `fflate` in the built server.

**Targeted Red command:** `npx vitest run tools/contracts/architecture.test.ts tools/contracts/tool-check.test.ts`.
Include the new test directory before running this command.

### Green

- [ ] Document the bootstrap contract before changing installation scripts.
      Files: `AGENTS.md`, `tools/remotion/README.md`, `measure/tech-stack.md`.
      Keep the root workspace definition authoritative.
- [ ] Implement deterministic tool bootstrap and verification.
      Files: `package.json`, affected lockfiles, `tsconfig.json`,
      `tools/remotion/tsconfig.json`, `vitest.config.ts`.
- [ ] Implement architecture checks and a focused formatting policy.
      Files: `eslint.config.js`, `tools/contracts/**`, `.prettierignore`,
      `.prettierrc.json`, package scripts as needed.
      Avoid unrelated source formatting.
- [ ] Normalize baseline formatting in an isolated style commit.
      Files: the 98 files reported by the review's formatting gate.
      Make no semantic source changes and do not suppress files from the check.
- [ ] Patch the vulnerable dependency through a compatible upgrade or record an evidenced mitigation.
      Files: affected manifests and lockfiles.
      Run the built-server tests before accepting the dependency change.
      Do not run `npm audit fix --force`.

### Verification

- [ ] Run the bootstrap check in a clean temporary checkout.
- [ ] Run architecture fixtures and tool verification.
- [ ] Run `npm run format:check` and `npm audit`; record any approved residual advisory.
- [ ] Run `npm run check`; commit the phase with install and gate timings.

---

## Phase 2: Required behavioral media gate

### Red

- [ ] Add failing browser coverage that starts a real export and probes the resulting file.
      File: `tools/e2e/walkthrough.mjs`.
      Reuse the measured fixtures from the integrity tracks.
- [ ] Add a failing test proving an unexpected fixture import error fails the walkthrough.
      File: `tools/e2e/walkthrough-contract.test.ts` (new).
- [ ] Add failing required-prerequisite checks and output measurement assertions.
      Files: `tools/e2e/media-gate.mjs` (new),
      `packages/compose/src/render-step.integration.test.ts`.
      Keep optional hardware checks outside this gate.

**Targeted Red command:** `npx vitest run tools/e2e/walkthrough-contract.test.ts packages/compose/src/render-step.integration.test.ts`.
Run with real renderer prerequisites and the required integration-test flag.

### Green

- [ ] Define offline-gate inputs and measurement tolerances before implementing the runner.
      Files: `tools/e2e/media-gate.mjs`, the renderer integration fixtures.
- [ ] Require local FFmpeg, ffprobe, and system Chrome for the full media gate.
      Files: the media gate, `tools/e2e/walkthrough.mjs`, `package.json`.
- [ ] Remove broad fixture-failure suppression and assert final output behavior.
      Files: the walkthrough and real integration tests.
- [ ] Add coverage reporting for changed modules and production wiring.
      Files: `vitest.config.ts`, package scripts, focused test modules.
      Keep fake providers local and deterministic.

### Verification

- [ ] Run the full offline gate through the shared heavy runner.
- [ ] Record counts, skips, timings, streams, durations, tone order, and publication results.
- [ ] Run `npm run check` and `npm run e2e`; commit the phase.

---

## Phase 3: Local ASR contract

### Red

- [ ] Add failing fixtures from one documented whisper CLI version.
      Files: `packages/ai/src/local.test.ts`, `packages/ai/src/local-provider.test.ts`,
      `packages/ai/testdata/whisper/**` (new).
      Cover multiword segments, word tokens, malformed offsets, and missing output.
- [ ] Add failing input-conversion and scratch-directory tests.
      File: `apps/web/server/transcribe-service.test.ts`.
      Preserve external source directories and exercise cancellation through the adapter.

**Targeted Red command:** `npx vitest run packages/ai/src/local.test.ts packages/ai/src/local-provider.test.ts apps/web/server/transcribe-service.test.ts`.

### Green

- [ ] Record the supported CLI, output schema, and flags before changing the provider.
      Files: `measure/tech-stack.md`, `packages/ai/src/local.ts`.
- [ ] Parse real word-level output and reject insufficient timing data.
      Files: `packages/ai/src/local.ts`, `packages/ai/src/types.ts`.
- [ ] Prepare compatible local input and job-owned scratch files through media adapters.
      Files: `apps/web/server/transcribe-service.ts`, focused `packages/media` builders.
      Do not add provider SDK calls outside `packages/ai`.

### Verification

- [ ] Run fixture tests without model downloads.
- [ ] Run a real local smoke test only if the binary and model already exist.
- [ ] Keep the existing ASR debt open when real verification is unavailable.
- [ ] Run `npm run check`; commit fixture provenance and exact limitations.

---

## Phase 4: Current context and track states

### Validation first

- [ ] Add a failing document-link and track-state validator before repairing context.
      Files: `tools/contracts/measure-docs.test.ts` (new).
      Exclude historical status snapshots from current-state equality checks.
- [ ] Record a disposition for every F17 inventory row.
      File: `measure/context-reconciliation-20261122.md` (new).
      Use source evidence, not assumed completion.

### Changes

- [ ] Rewrite product and guidelines for the current browser and FFmpeg application.
      Files: `measure/product.md`, `measure/product-guidelines.md`.
- [ ] Reconcile setup, workflow, prompts, and package inventories.
      Files: `AGENTS.md`, `measure/tech-stack.md`, `measure/workflow.md`,
      `measure/autonomous_prompt.md`, `measure/review-prompt.md`.
      Preserve human approval for paid work.
- [ ] Archive historical webcam and Go working-memory detail with links.
      Files: `measure/webcam_issue.md`, `measure/archive/**`,
      `measure/lessons-learned.md`, `measure/tech-debt.md`, `measure/index.md`.
- [ ] Reconcile every current track conflict from the review inventory.
      Files: their `spec.md`, `plan.md`, `metadata.json`, dogfood `findings.md`,
      `measure/tracks.md`, `measure/current_directive.md`.
      Keep unavailable hardware and provider checks explicit.

### Verification

- [ ] Run the document validator and verify current memory files each stay within 50 lines.
- [ ] Review all changed prose and links; preserve historical evidence.
- [ ] Run the focused formatting check and `npm run check`; commit the phase.

---

## Phase 5: Asset hygiene and final acceptance

### Validation first

- [ ] Add a tracked-media inventory with reference checks before moving files.
      File: `tools/contracts/assets.test.ts` (new).
      Include root MP4s, screenshots, and the Remotion public walkthrough asset.
- [ ] Record each asset's purpose and reproduction command.
      File: `assets/README.md` (new).
      Keep the required renderer asset unless its references change together.

### Changes

- [ ] Move only approved demonstration assets into documented directories.
      Files: the inventoried media and their renderer or document references.
      Do not rewrite Git history.
- [ ] Add suitable binary and generated-file Linguist attributes and temporary-output ignores.
      Files: `.gitattributes` (new), `.gitignore`.
      Keep source TypeScript visible to language classification.

### Verification

- [ ] Run asset-reference and document-link checks.
- [ ] Run `npm run format:check`, `npm run check`, `npm run e2e`, and the required offline media gate.
- [ ] Obtain independent review of media behavior, architecture guards, and current-document dispositions.
- [ ] Record hardware, paid-provider, and real-ASR limitations separately.
- [ ] Commit evidence and request PM acceptance.
- [ ] Check GitHub language classification after merge; keep it pending until remote results update.
- [ ] Update metadata and the registry only after accepted work and remaining gates are recorded.
