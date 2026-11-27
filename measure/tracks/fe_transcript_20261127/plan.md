# Plan: Frontend Transcript as a Document (review 2026-11-27)

**Status:** NOT STARTED
**Created:** 2026-11-27
**Focus:** One tab stop with a caret, restore of removed words, honest feedback after each edit, safe re-transcription, a fast word list.

**Check command:** targeted `npx vitest run` per task; then `npm run check`, `npm run e2e` and the UX gate through the heavy lock (orchestrator).
**Relation to older tracks:** Replaces and rolls up the archived `ux_transcript_document_20261122`. Depends on `fe_layout_20261127` L2 (transcript height) for visual checks.

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

- [x] **T1** (F07 FR4): Add `restoreRange` to core and the editing hook. ca7ddfa
      Evidence: 172 core and hook tests green; Red showed `restoreRange is not a function`. `restore` is unused in the UI until T4.
      Wave 1. Worker: `deepseek/deepseek-flash`.
      Files: `packages/core/src/transcript.ts`, `packages/core/src/transcript.test.ts`, `apps/web/hooks/use-transcript-document.ts`, `apps/web/hooks/use-transcript-document.test.tsx`.
      Red: Pure tests: `restoreRange` revives removed words in a range, keeps order and silences, is a no-op on kept words. Hook tests: restore is one undo step and survives a `reset` with a loaded saved transcript.
      Green: Add `restoreRange(transcript, from, to)`; expose `restore(from, to)` on the hook. Keep `reset` semantics; do not change saved format.
      Check: `npx vitest run packages/core apps/web/hooks/use-transcript-document.test.tsx`
- [x] **T2** (F06 FR1+FR3): One-tab-stop transcript listbox with keyboard selection, and the gate fix. d944bda
      Evidence: 196 component, lib and hook tests green; one tabbable element in the listbox. The gate tab-stop change (counts the real tab order) is still owed and needs the orchestrator. Debt: selection state is three overlapping values (`caret`, `keyboardSelection`, `selectionOverride`) and Escape reports a one-word selection to the parent; T7 folds it into one reducer.
      Wave 2. Worker: `openai/gpt-6-luna`.
      Files: `apps/web/components/TranscriptEditor.tsx`, `apps/web/components/transcript-editor.test.tsx`, `apps/web/lib/caret.ts` (new, pure), `apps/web/lib/caret.test.ts` (new), `tools/e2e/ux-gates.mjs` (tab-stop counting near 303-318). Depends on T1 (restore key) and L2.
      Red: Pure tests for caret movement and selection extension. Component tests: one tab stop; `aria-activedescendant` follows the caret; Shift+Arrow extends; Ctrl+A selects all; Escape clears; Delete removes; Space toggles. Gate: real tab-order walk.
      Green: Implement the caret model as pure functions. Render words as `role=option` spans in one `role=listbox`. Wire keys. Replace the gate's word-element count with a tab-order walk and a focus test on the container.
      Check: `npx vitest run apps/web/components/transcript-editor.test.tsx apps/web/lib/caret.test.ts`; UX gate (orchestrator)
- [x] **T3** (F06 FR2): Make the mode control one tab stop and put the stage first in the DOM. cd7fcea
      Evidence: UX gate in a clean worktree: tab stops before the transcript 14 to 6, inside the transcript 1, all five viewports clean. The first worker pass (luna, twice) failed; the orchestrator finished it and fixed a `order` mistake that would have moved the browser to the right. Decision: the gate budget is 6 stops before the transcript (was 2), as this track's spec set it. Ordered CSS keeps the desktop layout; the DOM order is stage, browser, inspector, which a screen reader reads in that order.
      Wave 2. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/components/TopBar.tsx` (or the component that renders `.segmented`), its test, `apps/web/styles/globals.css` (`order` rules only). Depends on L3 and L4 for the shared CSS file; run after them.
      Red: Test: `.segmented` has one `tabIndex=0` item; ArrowLeft/Right move focus and selection; Home/End jump. Gate: at most 6 stops before the transcript.
      Green: Roving `tabIndex`. Reorder DOM so the stage and transcript come before the inspector; keep the visual order with CSS `order`.
      Check: `npx vitest run apps/web/components`
- [x] **T4** (F07 FR4 (UI)): Show removed words as restorable and add the Restore action. c1de28f
      Evidence: 205 component, lib and hook tests green; Red: no `Restore` button. Restore leaves the selection in place after it runs; delete clears it.
      Wave 3. Worker: `claude-agent/haiku`.
      Files: `apps/web/components/TranscriptEditor.tsx`, its test, `apps/web/styles/globals.css` (removed-word style). Depends on T1 and T2.
      Red: Test: a removed word has `aria-disabled=true` (not `disabled`), a strike style class, and a Restore button on selection that calls `restore`.
      Green: Replace `disabled` with `aria-disabled`; add the Restore action to the selection toolbar.
      Check: `npx vitest run apps/web/components/transcript-editor.test.tsx`
- [x] **T5** (F09 FR5+FR6): Edit feedback: focus after delete, silence chip, search scroll and keys. c1de28f
      Evidence: same run; Red showed 8 failures (no chip, no scroll call, caret stayed, no message, no match 1, Enter inert). Three `KNOWN ISSUE F09` assertions flipped. Lint: `TranscriptEditor.tsx` line 57 has a `react-hooks/set-state-in-effect` error from T2; T7 removes it with the reducer.
      Wave 3. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Files: `apps/web/pages/index.tsx` (the delete, silence and search handlers near 931-943 and 1095-1102 only), `apps/web/components/TranscriptEditor.tsx`, `apps/web/components/transcript-feedback.test.tsx` (new). Depends on T2 (same component) and runs alone on `index.tsx`.
      Red: Tests: delete focuses the next kept word and the status region says `Removed 3 words`; a silence chip renders from `silences`; selecting a word calls `scrollIntoView({block:'nearest'})`; search input selects match 1; Enter goes next; Shift+Enter previous.
      Green: Implement in the handlers and the editor. No new state in `Home` beyond what the handlers need.
      Check: `npx vitest run apps/web/components/transcript-feedback.test.tsx apps/web/components/transcript-editor.test.tsx`
- [x] **T6** (F08 FR7): Confirm before Transcribe Again replaces edits. 36a5f9d
      Evidence: component suite green; Red showed the confirm never opening. The page passes `hasEdits` (removed words, silences or undoable edits). A reorder saved and reloaded is not detected as an edit. No visual check yet.
      Wave 4. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/components/IngestStage.tsx`, `apps/web/components/ingest-stage.test.tsx`. Depends on T5 (the only task allowed in `index.tsx`; this task must not need `index.tsx`: pass `hasEdits` in as a prop with a default).
      Red: Test: with `hasEdits` true, the first click opens a confirm that names the loss; Confirm calls the handler; Cancel does not.
      Green: Add an inline confirm (no `window.confirm`).
      Check: `npx vitest run apps/web/components/ingest-stage.test.tsx`
- [x] **T7** (F17 FR8): Memoized Word, precomputed match set, content-visibility, 5,000-word benchmark. 0f2c26b
      Evidence: 212 component, lib and hook tests green; eslint clean on the editor; Red showed 5,000 word renders per selection change, now 2; 5,006 DOM nodes (was about 9,500). The page wires `onSelectionClear`. The T2 lint error is gone.
      Wave 4. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/components/TranscriptEditor.tsx`, `apps/web/components/transcript-perf.test.tsx` (new), `apps/web/styles/globals.css` (`.transcript__segment` only). Depends on T2, T4.
      Red: Test: render 5,000 words, change selection, count `Word` renders through a render counter prop: only changed words re-render. Record the DOM node count and the selection cost.
      Green: first replace the three overlapping selection states in `TranscriptEditor` (`caret`, `keyboardSelection`, `selectionOverride`) with one reducer, and make Escape clear without reporting a one-word selection; then `React.memo` on `Word` with stable props; compute the match set once with `useMemo`; `content-visibility: auto` with `contain-intrinsic-size`.
      Check: `npx vitest run apps/web/components/transcript-perf.test.tsx`

## Phase 2: Rolled up from archived tracks

These phases came from older tracks that overlapped this one. The archived plan holds the full Red and Green detail. Read it first, then re-check each claim against the current code.

- [ ] **T8** (from `ux_transcript_document_20261122` Phase 2 (rest)): Pointer selection and edit keys.
      Wave 5. Worker: `openai/gpt-6-luna`.
      Detail: `measure/archive/superseded_frontend_review_20261127_ux_transcript_document_20261122/plan.md`.
      Scope: Drag, double-click (word) and triple-click (segment) selection; Alt+Up/Down moves a block as one undo step. `restoreRange` and Delete-to-restore are covered by T1 and T4.
- [ ] **T9** (from `ux_transcript_document_20261122` Phase 3): Floating selection toolbar and reading view.
      Wave 5. Worker: `deepseek/deepseek-v4-pro`.
      Detail: `measure/archive/superseded_frontend_review_20261127_ux_transcript_document_20261122/plan.md`.
      Scope: Floating toolbar with names and shortcut titles; remove the footer edit row and the Save button; paragraph times; follow-scroll with pause and reduced motion; Edit re-captured at three viewports. `content-visibility` and the 5,000-word benchmark are covered by T7.

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `claude-agent/opus` (Opus 5.5), report-only, with screenshots at 360, 768, 1024 and 1440 px, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS and the UX gate report recorded.
- [ ] Commit each task; record the 7-character SHA on its line.
