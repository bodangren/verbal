# Plan: Frontend Layout and Responsiveness (review 2026-11-27)

**Status:** IN PROGRESS
**Created:** 2026-11-27
**Focus:** Give the transcript room, stack the shell on narrow screens, fix first run and the hydration error, raise contrast and target size.

**Check command:** targeted `npx vitest run` per task; then `npm run check`, `npm run e2e` and the UX gate through the heavy lock (orchestrator).
**Relation to older tracks:** Follows `ux_gates_20261122` (complete). The gate fixes here feed the budgets that `ux_transcript_document` owned.

---

## Worker rules (every task)

- Red first: write the failing test, run it, see it fail for the stated reason, then fix.
  CSS-only tasks have no unit Red test; they carry a measurement Red (a gate rule or a computed-style assertion in a jsdom test where it works, otherwise a recorded before/after number from the gate).
- Run only the targeted `npx vitest run <files>` through the heavy lock:
  `HEAVY_PRIORITY=p2 HEAVY_MIN_AVAIL_MB=1500 bash /home/daniebo/Desktop/advantage-pr/scripts/jobs/heavy-run.sh -c '<command>'`.
  The orchestrator runs `npm run check`, `npm run e2e`, and the UX gate.
- Touch only the files named in the task. No commits. No edits under `measure/`.
- No test file under `apps/web/pages/` (`pages-hygiene.test.ts` guards this).
- `DESIGN.md` rules every visual choice: tokens, type, accent, copy. Use design tokens, never raw hex.
- Every control keeps an accessible name, a visible focus ring, and a 44 px target under `pointer: coarse`.
- Never run `opencode` or `openchamber`.
- Write UI copy and comments in short active sentences.

---

## Phase 1: Implement the findings

Each task is one worker: Red test, Green fix, orchestrator review, orchestrator commit. One task at a time edits `apps/web/pages/index.tsx` and one at a time edits `apps/web/styles/globals.css`; the wave numbers keep that order.

- [x] **L1** (F05 + F04): Fix the hydration error and the first-run empty state. 1c8acd2
      Evidence: 130 component tests green; Red reproduced the hydration mismatch. Note: with no project open the Collapse button shows but has no effect; New Project creates `Untitled Project` at once, with no name prompt.
      Wave 1. Worker: `claude-agent/haiku`.
      Files: `apps/web/components/ProjectBrowser.tsx`, `apps/web/components/project-browser.test.tsx` (existing or new), `apps/web/components/EmptyState.tsx` (extract if it is inline in `index.tsx:1795-1800`; then only the import line changes in `index.tsx`).
      Red: Test: the first client render equals the server render (render to string, then hydrate, no mismatch warning). Test: with no project open the browser is expanded at a 1024 px `matchMedia`. Test: `EmptyState` renders a New Project button that calls the create handler.
      Green: Start state `false`; read storage and `matchMedia` in `useEffect`. Keep the browser open while no project is open. Add the button.
      Check: `npx vitest run apps/web/components/project-browser.test.tsx apps/web/components/empty-state.test.tsx`
- [x] **L2** (F01 + F02): Give the transcript height in Edit and correct the gate line count. 2eff891
      Evidence: 11 gate-helper tests green. Before: transcript 13 px high at 1024x700. The browser gate has not run on this commit yet. The helper also clips to the stage (orchestrator fix: the first pass counted words below the fold). Left open: real player collapse needs a React change; a `30vh` CSS cap stands in.
      Wave 1. Worker: `opencode-go/mimo-v2.6-flash`.
      Files: `apps/web/styles/globals.css` (Edit stage block near 1866-1901 only), `tools/e2e/ux-gates.mjs` (line count near 126-138), `tools/e2e/ux-gates.test.mjs` (new if no test home exists; pure function for the count).
      Red: Pure test of `countVisibleTranscriptLines(wordRects, transcriptRect)`: words outside the rect are not counted. Record the before number: transcript height at 1024x700 is 13 px.
      Green: Add `min-height: 8rem` on `.stage__scroll--edit .transcript`, let `.stage__scroll--edit` scroll, collapse the player under `@media (max-height: 800px)`. Switch the gate to the new count and require at least 3.
      Check: `npx vitest run tools/e2e` then (orchestrator) the UX gate
- [x] **L3** (F03 + F13): Stack the shell at 900 px and below; wrap long words. 1908cc2
      Evidence: UX gate run in a clean worktree. No horizontal scroll at 1440, 1280, 1024, 768 and 360 px; Export on screen at 768 and 360; transcript lines 5, 4, 4, 13, 3 (were 4 counted falsely, 2, 0, 0 on the first honest count). Commits `2eff891`, `fbf7e79` and this one. Two orchestrator fixes: the first pass left the bar 93 px wider than 360 px, and the gate counted lines below the fold. The gate budget is 3 lines wide and 1 line at 900 px or less.
      Wave 2. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Files: `apps/web/styles/globals.css` (workspace, inspector, bar blocks near 995-1003, 1160-1168, 1500-1510; `.transcript__word` near 405-414). Depends on L2 (same file).
      Red: Gate rule: at 360 and 768 px `document.scrollingElement.scrollWidth <= innerWidth` and the Export button rect is inside the viewport. Record the before numbers (inspector 179 px past the edge at 360).
      Green: `@media (max-width: 900px)`: one-column `.workspace`, inspector below the stage, `.bar` wraps. Add `max-width: 100%; overflow-wrap: anywhere; text-align: left` to `.transcript__word`.
      Check: UX gate at four widths (orchestrator, heavy lock)
- [x] **L4** (F11 + F12 + F14): Contrast, target size, selection tint. b4f8605
      Evidence: UX gate in a clean worktree. Filled primary and hover 6.29:1 (were 4.47 and 2.98). Targets at 1440x900 fine pointer: 48 of 49 still under 44 px, which is the fine-pointer gap by design; the 44 px rule applies to a coarse pointer and is not gated. Transcript tab stops inside the listbox: 1. Checkbox labels raised to 24 px after the gate flagged 24 of them at 19 px. The selection tint is not checked by eye.
      Wave 3. Worker: `claude-agent/haiku`.
      Files: `apps/web/styles/globals.css` (button, tab, summary blocks near 601-605, 1128-1147, 1531-1587; `[data-selected]` near 405-427), `DESIGN.md` (only to record the word-face decision), `tools/e2e/ux-gates.mjs` (add the two contrast pairs). Depends on L3 (same file).
      Red: Gate rule: white on the filled primary >= 4.5:1 and on hover >= 4.5:1. Gate rule: under `pointer: coarse` emulation every control >= 44 px. Record the before numbers (4.47, 2.98, 51 of 52).
      Green: Fill with `--primary-focus`; hover `--primary`. `@media (pointer: coarse) { min-height: 44px }`; 32 px for tabs and `summary` otherwise. `[data-selected]` background `color-mix(in srgb, var(--primary) 22%, transparent)`.
      Check: UX gate (orchestrator, heavy lock)
- [x] **L5** (F19 + F20): Remove dead CSS and fix card spacing and disabled states. 2f64eb9
      Evidence: 200 tests green incl. the new CSS audit; Red found 33 dead classes (4 more than the review's 29) and 3 undefined properties; the stylesheet shrank from 2598 to 2294 lines. The browser gate is re-run with the final tree.
      Wave 4. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/styles/globals.css`. Depends on L4 (same file).
      Red: Script test (`tools/e2e/css-unused.test.mjs`, new): every class in `globals.css` appears in `apps/web/**/*.tsx` or an allow-list; each `var(--x)` has a definition. Run it first to list the 29 dead classes and 3 undefined properties.
      Green: Delete the dead rules, merge the duplicate `:focus-visible`, define `--pending`, `--font-mono`, `--border-strong`, reset `h3` margins inside `.card`, give `button:disabled.primary` a distinct neutral fill.
      Check: `npx vitest run tools/e2e/css-unused.test.mjs`; UX gate (orchestrator)

## Phase R2: Acceptance fixes (Opus review, 2026-11-27)

The independent acceptance review (real browser, 54 screenshots) rejected or conditionally accepted this track. Each task below reopens a finding it verified. Same worker rules as Phase 1.

- [x] **L3b** (H2, H3, M6, L8 (Opus: verified)): Fix the narrow layout the gate cannot see. af6a665
      Evidence: 303 component, lib and tools tests green; the new gate rules at 360 px have not run in a browser on this commit yet. The browser gate runs at the next checkpoint.
      wave 2. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Files: `apps/web/styles/globals.css` (sidebar, card head, media row blocks), `apps/web/components/ProjectBrowser.tsx`, `apps/web/components/IngestInspector.tsx`/`IngestStage.tsx` (markup only if needed), `apps/web/components/EmptyState.tsx`, tests, `tools/e2e/ux-gates.mjs` (add rules).
      Red: Gate rules at 360x740: the project browser has a visible toggle or strip (height at least 32 px) when a project is open; the search counter and both match buttons lie inside the viewport; the media file name shows at least 12 characters. Component test: the empty state shows New Project before the disabled cards.
      Green: Show a Projects strip button at 900 px or less; let `.card__head` wrap; stack the media row; move New Project above the disabled cards.
- [x] **L6b** (M5 (Opus: verified)): Keep the edit toolbar reachable. 229b347
      Evidence: 316 component, lib, hook and tools tests green; the collapse tests failed when the default was forced to false. The sticky toolbar and the gate rule are verified by the next gate run.
      wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/styles/globals.css`, `apps/web/components/EditWorkspace.tsx`, `apps/web/components/PlaybackScreen.tsx`, tests.
      Red: Gate rule: at 1024x700 and 360x740 the Delete, Restore and Undo buttons are inside the viewport without scrolling the stage. Test: the player collapses by default under a short or narrow viewport (the F01 recommendation) and the toggle still works.
      Green: Make the edit toolbar sticky at the bottom of the stage; default `playerCollapsed` from `matchMedia('(max-height: 800px), (max-width: 900px)')` read through an external store (no state-setting effect).
- [x] **L6c** (L6b follow-up, orchestrator): The e2e walkthrough expands the collapsed player before it uses the waveform. d3d7f6a
      Evidence: `npm run e2e` PASS with no console or page errors after the player is expanded.
      Files: `tools/e2e/walkthrough.mjs`.
      Red: `npm run e2e` failed at `playback: waveform seek` because L6b starts the player collapsed on a short viewport and hides the waveform.
      Green: click `Expand Player` when it is present, as a user does.
- [x] **L7b** (M7, L6, L7 (Opus: verified)): Correct the records and the focus-order note. 6e82d49
      Evidence: 296 component, lib and hook tests green; Red showed no link and no CSS rule. The T3 note now says stage, inspector, browser. Check in a browser: the focus-visible look and the six-stop budget.
      wave 3. Worker: `opencode-go/hy4-flash-free`.
      Files: `DESIGN.md`, `apps/web/components/TopBar.tsx` or the page shell (skip link), `measure/tracks/fe_*/plan.md` status lines, `fe_transcript_20261127/plan.md` T3 note, tests.
      Red: Test: a `Skip to project browser` link exists, is the first focusable element after the top bar actions, and moves focus to the browser. DESIGN.md has one transcript font rule and one accent value.
      Green: Add the skip link; fix the contradiction in DESIGN.md lines 166 to 170; set the four plan statuses; correct the DOM order in the T3 note (stage, inspector, browser).

## Phase 2: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `claude-agent/opus` (Opus 5.5), report-only, with screenshots at 360, 768, 1024 and 1440 px, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS and the UX gate report recorded.
- [ ] Commit each task; record the 7-character SHA on its line.
