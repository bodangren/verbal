# Plan: UX Gates and Design Conformance

**Status:** IN PROGRESS — Phase 2 complete; 6 budget failures await Shell/Transcript
**Created:** 2026-11-22
**Focus:** Measure the experience, then hold the design system.

**Check command:** `npm run check`, `npm run e2e`, and `node tools/e2e/ux-gates.mjs`.
**Dependencies:** None.

---

## Phase 1: The gate

### Red

- [x] Add `tools/e2e/**/*.test.ts` to the Vitest include list.
      File: `vitest.config.ts`.
      The gate imports the `.ts` helpers through Node 24 type stripping.
- [x] Add failing tests for the contrast helper with the `DESIGN.md` pairs.
      File: `tools/e2e/contrast.test.ts` (new).
      Include #707070 on #252525 (3.10:1) as a fail and #A0A0A0 on #252525 (5.86:1) as a pass.
- [x] Add a failing budget test for the report reader.
      File: `tools/e2e/ux-budgets.test.ts` (new).
      A report over budget fails and names the step.
- [x] Add the gate script with the baseline budgets from the review. It fails on today's build.
      Files: `tools/e2e/ux-gates.mjs` (new), `tools/e2e/ux-budgets.json` (new).

**Targeted Red command:** `npx vitest run tools/e2e/contrast.test.ts tools/e2e/ux-budgets.test.ts`.

### Green

- [x] Implement the contrast helper and the budget reader as pure functions.
      Files: `tools/e2e/contrast.ts` (new), `tools/e2e/ux-budgets.ts` (new).
- [x] Record clicks, keys, tab stops, scroll, names, focus outline, and live regions in the gate.
      File: `tools/e2e/ux-gates.mjs`.

### Verification

- [x] Run the targeted tests.
- [x] Run the gate once; record the baseline numbers in this plan.
- [x] Commit the phase.

### Baseline — 2026-11-23

`node tools/e2e/ux-gates.mjs` (15 failures):

- Core journey: 9 clicks + 1 typed name to an editable transcript (budget 6).
- Transcript: 6 Tab stops before the first word (budget 2); 3 per-word stops for 3 words (budget 1).
- Visible transcript lines: 1 at 1440x900, 1 at 1280x800, 0 at 1024x700 (budget 3); page scroll 0 everywhere.
- 2 polite live regions (budget 1).
- No `h1` in any mode.
- Disabled buttons with an indigo background: Stop Preview, Stop Recording, Remove Accepted, Generate Image, Generate Video.

The report is `tools/e2e/ux-report.json`. Later phases must turn these numbers green.

### Phase 2 result — 2026-11-23

Conformance is green: five contrast pairs pass, no disabled primary keeps an
indigo fill, headings form one h1 -> h2 -> h3 -> h4 outline, every interactive
element has a name, focus outlines pass, and there is one polite live region.

The gate still reports six failures, all owned by later UX tracks:

- 9 clicks to an editable transcript (Shell and Core Flow).
- 6 Tab stops before the first word and 3 per-word stops (Transcript as a Document).
- 1 visible transcript line at 1440/1280 and 0 at 1024 (Shell and Transcript).

---

## Phase 2: Contrast, type, and accent

### Red

- [x] Add a failing style scan test.
      File: `apps/web/styles/globals.test.ts` (new).
      It fails on 10px sizes, gradients, `transition: all`, and colors outside the token list.
- [x] Extend the gate with token contrast for removed words, the active word, and error text.

**Targeted Red command:** `npx vitest run apps/web/styles/globals.test.ts`.

### Green

- [x] Fix the failing tokens and record each change in `DESIGN.md`.
      Files: `DESIGN.md`, `apps/web/styles/globals.css`.
- [x] Replace the 10px sizes, the gradient mark, and raw hex values with tokens.
      File: `apps/web/styles/globals.css`.

### Verification

- [x] Run the style test and the gate at three viewports.
- [x] Re-capture each mode and compare against the review screens.
- [x] Commit the phase.

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
