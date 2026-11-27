# Plan: Frontend Export Flow and Dialogs (review 2026-11-27)

**Status:** IN PROGRESS
**Created:** 2026-11-27
**Focus:** A truthful export panel with progress and a busy state, one name for the flow, accessible dialogs, reachable error detail.

**Check command:** targeted `npx vitest run` per task; then `npm run check`, `npm run e2e` and the UX gate through the heavy lock (orchestrator).
**Relation to older tracks:** Replaces and rolls up the archived `ux_deliver_export_20261122`. Depends on `job_integrity_20261127` J6 for job events; this track starts on the current polling and switches later.

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

- [x] **X1** (F15 FR2): One accessible dialog component for the picker and the batch dialog. 213c8ed
      Evidence: 226 component, lib and hook tests green; Red: `Dialog` did not exist. Backdrop mousedown closes, as the old overlays did. The native focus trap is not asserted in jsdom; the Opus acceptance run checks it in a browser.
      Wave 1. Worker: `openai/gpt-6-luna`.
      Files: `apps/web/components/Dialog.tsx` (new), `apps/web/components/dialog.test.tsx` (new), `apps/web/components/MediaPicker.tsx`, `apps/web/components/BatchDialog.tsx`, their tests, `apps/web/styles/globals.css` (dialog block near 1992-1999 only; run after L5 or on its own lines).
      Red: Tests: Tab cycles inside; Escape closes; initial focus lands on the first control; focus returns to the opener; the body scrolls with 200 items.
      Green: Wrap native `<dialog>` with `showModal()`; replace the two hand-built overlays.
      Check: `npx vitest run apps/web/components/dialog.test.tsx apps/web/components/media-picker.test.tsx apps/web/components/batch-dialog.test.tsx`
- [x] **X2** (F10 FR1): Busy state, labelled progress and live announcements for export. 2511eb1
      Evidence: 24 component tests green; Red showed no `Exporting…` button and no progressbar. Gap: a queued then running job announces `Export started` twice; X4 wires `running`, `progressPercent`, `onPreview` and `onAnnounce`.
      Wave 2. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Files: `apps/web/components/ExportControls.tsx`, `apps/web/components/export-controls.test.tsx`, `apps/web/components/job-status.ts`, `apps/web/components/job-status.test.ts`. No `index.tsx` change beyond passing props (a separate task, X4, owns `index.tsx`).
      Red: Tests: with `running` true, Export and Preview are disabled and labelled `Exporting…`; a `<progress>` with an accessible name shows the percent; the done and failed texts reach the status region prop.
      Green: Props-driven; keep the component pure.
      Check: `npx vitest run apps/web/components/export-controls.test.tsx apps/web/components/job-status.test.ts`
- [x] **X3** (F21 FR4): Make the error detail visible and reachable. 17b2818
      Evidence: 226 component, lib and hook tests green; Red showed the detail only in `title`. The status bar styles are committed with X1. No visual check yet.
      Wave 2. Worker: `opencode-go/hy4-flash-free`.
      Files: `apps/web/components/StatusBar.tsx` (extract if inline), `apps/web/components/status-bar.test.tsx` (new), `apps/web/styles/globals.css` (status bar block only).
      Red: Test: a status with detail renders a `<details>` whose summary is focusable and whose body shows the detail; no `title`-only detail.
      Green: Render the detail in the disclosure. Keep the live region as is.
      Check: `npx vitest run apps/web/components/status-bar.test.tsx`
- [x] **X4** (F10+F16 FR1+FR3): Wire the export panel in the page and rename the flow to Export. 23e139d
      Evidence: six new page tests green; suite 515 passed with one failure that was the `transcribe-api` test fixed in `496060e`. Open: the walkthrough, UX gate and recorder were not run on this commit. Preview now uses the selected tier in one button. `Exported to <path>` may be overwritten by `Export finished`; check in the browser. The status bar still shows `Job running` for non-export jobs.
      Wave 3. Worker: `deepseek/deepseek-v4-pro`.
      Files: `apps/web/pages/index.tsx` (export, preview, status text, tab label, save text), `apps/web/components/TopBar.tsx`, `apps/web/components/top-bar.test.tsx`, `apps/web/components/export-cards.test.tsx`. Depends on X2, X3 and on T5 (only one task at a time edits `index.tsx`).
      Red: Tests: the tab, heading, button and status text all say `Export`; no `Save` button in Edit; the clause `Save the transcript to keep it` is gone; Export is disabled while a job runs.
      Green: Pass `running` and `progress` into `ExportControls`; send start and result to the status region; rename every string; remove the Save button.
      Check: `npx vitest run apps/web/components`

## Phase 2: Rolled up from archived tracks

These phases came from older tracks that overlapped this one. The archived plan holds the full Red and Green detail. Read it first, then re-check each claim against the current code.

- [ ] **X5** (from `ux_deliver_export_20261122` Phase 1): Storyboard strip and cached thumbnails.
      Wave 5. Worker: `deepseek/deepseek-v4-pro`.
      Detail: `measure/archive/superseded_frontend_review_20261127_ux_deliver_export_20261122/plan.md`.
      Scope: Card model (kind, label, duration, brand ends, missing assets); listbox with arrow keys; cached thumbnail endpoint with an injected runner; selected scene in the inspector.
- [ ] **X6** (from `ux_deliver_export_20261122` Phase 2 (rest)): Export panel states and defaults.
      Wave 5. Worker: `openai/gpt-6-luna`.
      Detail: `measure/archive/superseded_frontend_review_20261127_ux_deliver_export_20261122/plan.md`.
      Scope: Ready, running, done, failed, cancelled, and the Replace confirm; Cancel; folder picker mode for the output file; Title from the project, Contact from storage; built on the job events from `job_integrity_20261127` J6. X2 and X4 cover busy state and naming.
- [ ] **X7** (from `ux_deliver_export_20261122` Phase 3): Advanced drawer.
      Wave 6. Worker: `claude-agent/haiku`.
      Detail: `measure/archive/superseded_frontend_review_20261127_ux_deliver_export_20261122/plan.md`.
      Scope: The three expert panels move into a drawer that is closed by default and remembers its state; estimate-before-generate stays.

## Phase R2: Acceptance fixes (Opus review, 2026-11-27)

The independent acceptance review (real browser, 54 screenshots) rejected or conditionally accepted this track. Each task below reopens a finding it verified. Same worker rules as Phase 1.

- [x] **X34b** (H5, M1, M2, M3, L9 (Opus: verified)): Make export and error results readable and keep the output path. da8cfb5
      Evidence: 277 component, lib and hook tests green; Red showed 11 failures (path missing, no visible percent, Preview label, no in-panel failure, double announce). The popover and the 360 px result are not yet checked in a browser.
      wave 1. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Files: `apps/web/components/DeliverWorkspace.tsx`, `apps/web/components/ExportControls.tsx`, `apps/web/components/job-status.ts`, `apps/web/components/StatusBar.tsx`, their tests, `apps/web/styles/globals.css` (export panel and status bar blocks only).
      Red: Tests: the export result text keeps the output path (`Exported to <path>`) in the panel and the status region (the generic `Export finished` does not replace it); the busy panel shows `Exporting · N%` as visible text beside a full-width progress bar; Preview keeps its idle label and is only disabled; a failed export shows its message and detail INSIDE the Export panel next to the button; the status bar error detail opens upward as a popover that is not clipped (height not limited by the 30 px row); `Export started` is announced once per job.
      Green: Fold the path into `jobResultText`; announce per job id once; render the failure in the panel; position the disclosure with `bottom: 100%`.

## Phase R3: Acceptance fixes, round 2 (Opus round 2 review, 2026-11-28)

The second independent review verified these defects, some of them caused by the round 2 fixes. Same worker rules as Phase 1.

- [x] **X34c** (N6, N7, N10 (Opus: verified)): Show request failures in the Export panel, one message per event, distinct button names. 53d5f70
      Evidence: Red showed the request error outside the panel, two done messages and no distinct bar name. Names chosen: top-bar button `Open Export`, mode tab `Export`, panel button `Export Video`. Component tests green; the three skip-link failures belong to L7c (duplicate link while it was mid-edit). Browser verification comes with the next gate.
      wave 1. Worker: `claude-agent/haiku`.
      Files: `apps/web/components/DeliverWorkspace.tsx`, `apps/web/components/ExportControls.tsx`, `apps/web/components/TopBar.tsx`, `tools/e2e/walkthrough.mjs`, `tools/e2e/ux-gates.mjs`, `tools/dogfood/record-howto.mjs`, tests.
      Red: Tests: a failed export REQUEST (HTTP 500) renders its message in the Export panel; one export produces one done message in the status region (no `Exported to` then `Export finished`); the top-bar button has the accessible name `Export Video` while the mode tab stays `Export`; the walkthrough, gate and recorder select the new name.
      Green: Route request errors to the panel failure slot; drop the duplicate message; set `aria-label` on the top-bar button.

## Phase R4: Acceptance fixes, final round (Sol and Opus round 3, 2026-11-28)

The third review found no Blocker. These High and Medium findings remain. Same worker rules as Phase 1.

- [x] **X34d** (R3-3, R3-5 (Opus: verified)): Clear the old success message when an export request fails and record the alert style. a2dae1d
      Evidence: 323 component, lib and hook tests green; both new tests failed first (the old `Export finished` text stayed). The status shows `Export failed`; the full message is in the panel alert. Not re-checked in a browser.
      Worker: `claude-agent/haiku`.
      Files: `apps/web/components/DeliverWorkspace.tsx`, tests, `DESIGN.md`.
      Red: Test: after a done export and then an HTTP 500 request, the status region does not show the old `Export finished` text; DESIGN.md states the filled red `pane-alert` as a second exception to the left-border rule.
      Green: Set or clear the status message in the request failure branch; add one DESIGN.md sentence.

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `claude-agent/opus` (Opus 5.5), report-only, with screenshots at 360, 768, 1024 and 1440 px, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS and the UX gate report recorded.
- [ ] Commit each task; record the 7-character SHA on its line.
