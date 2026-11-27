# Frontend review, 2026-11-27

**Reviewer:** Claude Fable 5.2 (high effort), read-only, on `master` at `c6dc3f4`. One live check through the heavy lock (existing `dist`, fake ASR, Chrome). Shots: `/tmp/opencode/frontend-review/`.

| ID | Severity | Area | Finding | Track and task |
|---|---|---|---|---|
| F01 | Blocker | Responsive | The transcript gets 13 px (0 px on small screens) in Edit. | fe_layout L2 |
| F02 | High | Gate | The gate counts lines against the stage, so it hides F01. | fe_layout L2 |
| F03 | High | Responsive | No layout breakpoint; Export is off screen at 360 px. | fe_layout L3 |
| F04 | High | UX | First run: the browser is a 40 px rail and the empty state has no button. | fe_layout L1 |
| F05 | High | Code | React hydration error #418 at 1100 px or less. | fe_layout L1 |
| F06 | High | A11y | 200 tab stops in the transcript, 15 before it; the gate cannot pass. | fe_transcript T2, T3 |
| F07 | High | UX | Removed words cannot be restored after a reload. | fe_transcript T1, T4 |
| F08 | High | UX | Transcribe Again replaces edits with no confirm. | fe_transcript T6 |
| F09 | High | UX | No feedback after delete, silence, or search. | fe_transcript T5 |
| F10 | High | UX | Export stays enabled while a job runs; progress is outside the live region. | fe_export_flow X2, X4 |
| F11 | Medium | A11y | Filled-control contrast 4.47:1 and 2.98:1. | fe_layout L4 |
| F12 | Medium | A11y | 51 of 52 controls in Edit are under 44 px. | fe_layout L4 |
| F13 | Medium | Responsive | A long unbroken word is cut. | fe_layout L3 |
| F14 | Medium | UI | Word face and selection style differ from `DESIGN.md`. | fe_layout L4 |
| F15 | Medium | A11y | Dialogs have no focus trap or Escape. | fe_export_flow X1 |
| F16 | Medium | UX | One flow has four names; Save button beside auto-save. | fe_export_flow X4 |
| F17 | Medium | Perf | `Home` holds about 75 state values; 9,506 DOM nodes at 5,000 words. | fe_transcript T7; fe_page_structure P2, P3 |
| F18 | Medium | Code | `index.tsx` is 2,576 lines with three tests. | fe_page_structure P1 to P3 |
| F19 | Low | Code | 29 dead classes, duplicate rules, undefined properties. | fe_layout L5; fe_page_structure P4 |
| F20 | Low | UI | Uneven card spacing; disabled primary looks like ghost. | fe_layout L5 |
| F21 | Low | A11y | Error detail is only a `title`. | fe_export_flow X3 |

**Found sound:** no page scroll at any tested width; every control has an accessible name; heading order; focus ring 3.73:1; reduced-motion rule; long names and Thai wrap; Ctrl+Z restores words; debounced one-at-a-time auto-save; session restore; error copy gives a next step; no long task at 5,000 words on 1x CPU; three script chunks (407 KB) and 33 KB of CSS.

**Not checked live:** export and preview jobs, the Studio, a real 30-minute file.

**Rolled up from archived tracks** (`measure/archive/superseded_frontend_review_20261127_*`): Transcript as a Document (caret, pointer selection, toolbar, reading view); Deliver Strip and Export Panel (strip, panel states, Advanced drawer).
