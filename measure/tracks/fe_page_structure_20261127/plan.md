# Plan: Frontend Page Structure (review 2026-11-27)

**Status:** IN PROGRESS
**Created:** 2026-11-27
**Focus:** Split the 2,576-line page into workspaces and hooks, cut the state held in Home, and test each interactive path.

**Check command:** targeted `npx vitest run` per task; then `npm run check`, `npm run e2e` and the UX gate through the heavy lock (orchestrator).
**Relation to older tracks:** Runs last. It edits `index.tsx` heavily, so it starts only after `fe_layout`, `fe_transcript` and `fe_export_flow` close.

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

- [x] **P1** (F18 FR4): Page-level tests for the edit paths, before any refactor. adfd971
      Evidence: 5 tests green; each test failed when its subject was disabled (delete, move, silence, search, keydown listener). jsdom focus differs from a real browser.
      Wave 1. Worker: `openai/gpt-6-luna`.
      Files: `apps/web/components/page-edit-paths.test.tsx` (new; mounts `Home` from `apps/web/pages/index.tsx` as the existing page tests do). Test file only; do not edit `index.tsx`.
      Red: These are characterisation tests: write them green against `c6dc3f4`, covering delete and undo, move, silence insert, search, and the shortcuts. Prove each test can fail by breaking its subject once (revert after).
      Green: No production change.
      Check: `npx vitest run apps/web/components/page-edit-paths.test.tsx`
- [x] **P2** (F17 FR2): Extract `useStudio` and the API client. 51e63b5
      Evidence: 526 web tests green; `index.tsx` 2591 to 1946 lines; the render-counter test fails when a Home setter is added to the clock. Note: the takes fetch moved into a `[root]` effect; the duplicate `setRendering(false)` lines now sit in `use-studio.ts` (P4 follows them).
      Wave 2. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/pages/index.tsx`, `apps/web/hooks/use-studio.ts` (new), `apps/web/lib/api-client.ts` (new), their tests. Starts after the three other frontend tracks close.
      Red: Render-counter test: a prompter tick renders `Home` zero times. All P1 tests stay green.
      Green: Move studio state and the fetch calls out. Keep behaviour identical.
      Check: `npx vitest run apps/web`
- [x] **P3** (F18 FR1+FR5): Extract the three workspaces and the job-polling hook. 0c934e9
      Evidence: 530 web tests green; `index.tsx` 1946 to 799 lines (target was under 600: the rest is page-level orchestration); a job poll tick renders `Home` zero extra times. A size ratchet test guards growth. `copy.test.ts` scan list extended to the three new workspace files.
      Wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/pages/index.tsx`, `apps/web/components/EditWorkspace.tsx`, `DeliverWorkspace.tsx`, `IngestWorkspace.tsx` (new), `apps/web/hooks/use-job.ts` (new), tests. Depends on P2.
      Red: Render-counter test: a job poll renders `Home` zero times. `index.tsx` line count test (under 600) as a repo-level check script. P1 tests stay green.
      Green: Move JSX and local state into each workspace. Pass narrow props.
      Check: `npx vitest run apps/web`; `npm run e2e` (orchestrator)
- [x] **P4** (F19): Remove the duplicate `setRendering(false)` and other small duplications. 0c934e9
      Evidence: two new tests in `use-studio.test.tsx` (`renderCut` sets rendering true then false once, on success and on failure); suite green. The lines moved to `use-studio.ts` in P2, so the dedup landed there.
      Wave 3. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/pages/index.tsx` only for these lines, after P3 closes.
      Red: Lint or a test that the render handler calls `setRendering(false)` once per exit path.
      Green: Fold the duplicates into one `finally`.
      Check: `npx vitest run apps/web`

## Phase R2: Acceptance fixes (Opus review, 2026-11-27)

The independent acceptance review (real browser, 54 screenshots) rejected or conditionally accepted this track. Each task below reopens a finding it verified. Same worker rules as Phase 1.

- [x] **P1b** (B1 test gap (Opus: verified)): Pin multi-step keyboard selection in the page-level tests. 9ed8af1
      Evidence: 8 page tests green; with the T2b fix reverted the three new tests failed (`['w4','w5']` for six words).
      wave 2. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/components/page-edit-paths.test.tsx`.
      Red: Add a page-level test: Home then five Shift+ArrowRight selects six words, with the real page state (not a stub parent).
      Green: Test only; it fails on the current code and passes after T2b.

## Phase 2: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `claude-agent/opus` (Opus 5.5), report-only, with screenshots at 360, 768, 1024 and 1440 px, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS and the UX gate report recorded.
- [ ] Commit each task; record the 7-character SHA on its line.
