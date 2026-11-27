# Spec: Frontend Layout and Responsiveness

Source: Fable frontend review of 2026-11-27 at `c6dc3f4`. Shots are in `/tmp/opencode/frontend-review/`.

## Problem

- **F01 (Blocker).** The transcript gets no height in Edit: 13 px at 1024x700, 0 px at 720x450 and 360x740 (`apps/web/styles/globals.css:1866-1901`).
- **F02.** The gate counts lines against the stage rectangle, so it reports 4 lines where F01 shows 1 (`tools/e2e/ux-gates.mjs:126-138`).
- **F03.** The shell has no layout breakpoint. At 360 px the inspector is 179 px past the viewport and Export is 163 px off screen (`globals.css:995-1003,1160-1168,1500-1510`).
- **F04.** At 1100 px or less the project browser starts as a 40 px rail, and the empty state has no button (`ProjectBrowser.tsx:36-39`, `index.tsx:1795-1800`).
- **F05.** Each load at 1100 px or less throws React hydration error #418 (`ProjectBrowser.tsx:107`).
- **F11.** White on `--primary` is 4.47:1 at 12 px; white on `--primary-hover` is 2.98:1 (`globals.css:1559-1568,1144-1147,601-605`).
- **F12.** In Edit, 51 of 52 controls are under 44 px (`globals.css:1128-1138,1531-1545,1574-1587`).
- **F13.** A long unbroken word is cut: `scrollWidth` 528 against `clientWidth` 326 (`globals.css:405-414`).
- **F14.** Words use Inter where `DESIGN.md:166-169` says monospace; a selection is a border only (`globals.css:405-427`).
- **F19, F20.** 29 dead classes, a duplicate `:focus-visible`, three undefined custom properties, uneven card heading margins, and a disabled primary button that looks like a ghost button.

## Requirements

1. FR1. `.stage__scroll--edit .transcript` has `min-height: 8rem`. The Edit stage scrolls. The player collapses by default under `@media (max-height: 800px)`.
2. FR2. The gate counts transcript words whose rectangles intersect `.transcript`, and fails below 3 visible lines at 1024x700.
3. FR3. Under `@media (max-width: 900px)` the workspace is one column, the inspector sits below the stage, and the top bar wraps. No horizontal scroll at 360, 768, 1024 and 1440 px.
4. FR4. The browser stays open while no project is open. `EmptyState` has a New Project action.
5. FR5. `ProjectBrowser` renders the same markup on server and client; storage and `matchMedia` are read in an effect.
6. FR6. Filled primary controls use `--primary-focus` (6.29:1); hover uses `--primary`. The gate checks both pairs.
7. FR7. Under `pointer: coarse` every control is at least 44 px; tabs and `summary` at least 32 px otherwise.
8. FR8. `.transcript__word` has `max-width: 100%; overflow-wrap: anywhere`. A selected word has an indigo tint (`color-mix` on `--primary`). Decide the word face (monospace per `DESIGN.md`, or amend `DESIGN.md`) and record the decision.
9. FR9. Dead classes removed, one `:focus-visible`, the three custom properties defined, card headings spaced, disabled primary distinct from ghost.

## Acceptance

- At 360, 768, 1024 and 1440 px the page has no horizontal scroll, Export is on screen, and the transcript shows at least 3 lines at 1024x700.
- The UX gate passes the new line and contrast rules. Screenshots recorded in the plan.
- No hydration error in the browser console at any width.
