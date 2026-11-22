# Plan: UX Gates and Design Conformance

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Measure the experience, then hold the design system.

**Check command:** `npm run check`, `npm run e2e`, and `node tools/e2e/ux-gates.mjs`.
**Dependencies:** None.

---

## Phase 1: The gate

### Red

- [ ] Add `tools/e2e/**/*.test.ts` to the Vitest include list.
      File: `vitest.config.ts`.
      The gate imports the `.ts` helpers through Node 24 type stripping.
- [ ] Add failing tests for the contrast helper with the `DESIGN.md` pairs.
      File: `tools/e2e/contrast.test.ts` (new).
      Include #707070 on #252525 (3.10:1) as a fail and #A0A0A0 on #252525 (5.86:1) as a pass.
- [ ] Add a failing budget test for the report reader.
      File: `tools/e2e/ux-budgets.test.ts` (new).
      A report over budget fails and names the step.
- [ ] Add the gate script with the baseline budgets from the review. It fails on today's build.
      Files: `tools/e2e/ux-gates.mjs` (new), `tools/e2e/ux-budgets.json` (new).

**Targeted Red command:** `npx vitest run tools/e2e/contrast.test.ts tools/e2e/ux-budgets.test.ts`.

### Green

- [ ] Implement the contrast helper and the budget reader as pure functions.
      Files: `tools/e2e/contrast.ts` (new), `tools/e2e/ux-budgets.ts` (new).
- [ ] Record clicks, keys, tab stops, scroll, names, focus outline, and live regions in the gate.
      File: `tools/e2e/ux-gates.mjs`.

### Verification

- [ ] Run the targeted tests.
- [ ] Run the gate once; record the baseline numbers in this plan.
- [ ] Commit the phase.

---

## Phase 2: Contrast, type, and accent

### Red

- [ ] Add a failing style scan test.
      File: `apps/web/styles/globals.test.ts` (new).
      It fails on 10px sizes, gradients, `transition: all`, and colors outside the token list.
- [ ] Extend the gate with computed contrast for removed words, the active word, and error text.

**Targeted Red command:** `npx vitest run apps/web/styles/globals.test.ts`.

### Green

- [ ] Fix the failing tokens and record each change in `DESIGN.md`.
      Files: `DESIGN.md`, `apps/web/styles/globals.css`.
- [ ] Replace the 10px sizes, the gradient mark, and raw hex values with tokens.
      File: `apps/web/styles/globals.css`.

### Verification

- [ ] Run the style test and the gate at three viewports.
- [ ] Re-capture each mode and compare against the review screens.
- [ ] Commit the phase.

---

## Phase 3: Copy and status channel

### Red

- [ ] Add failing component tests for Title Case labels and the single live region.
      Files: `apps/web/components/*.test.tsx`, `apps/web/pages/index.test.tsx` (new).
- [ ] Add failing tests for the error-message map.
      File: `apps/web/lib/error-copy.test.ts` (new).
      A known API error maps to a message with a next step.

**Targeted Red command:** `npx vitest run apps/web/lib/error-copy.test.ts apps/web/pages/index.test.tsx`.

### Green

- [ ] Add the error-message map and use it in `guard`.
      Files: `apps/web/lib/error-copy.ts` (new), `apps/web/pages/index.tsx`.
- [ ] Apply Title Case and `…` copy. Remove the second live region from the save state.
      Files: `apps/web/pages/index.tsx`, `apps/web/components/*.tsx`.

### Verification

- [ ] Run `npm run check`, `npm run e2e`, and the gate through the heavy runner.
- [ ] Record the final numbers. Update the registry and metadata after acceptance.
