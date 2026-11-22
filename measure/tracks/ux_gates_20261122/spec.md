# Specification: UX Gates and Design Conformance

## Problem

No gate measures the user experience. The walkthrough proves that controls work.
It does not count clicks, tab stops, contrast, or accessible names.
Several styles break `DESIGN.md`: off-scale type, a gradient mark, and text below 4.5:1 contrast.
Button copy mixes sentence case and Title Case. Two live regions announce at the same time. Disabled primary buttons look enabled. Headings skip levels.
See [the UX review](../../review-ux-2026-11-22.md), findings U09, U11, U12, and U21.

## Goals

1. Measure the core task flow and keyboard reach on every UX change.
2. Hold all text to WCAG AA contrast with the `DESIGN.md` palette.
3. Use only the `DESIGN.md` type scale, spacing, and accent rules.
4. Make copy consistent: Title Case controls, `…` for work in progress, a next step in each error.
5. Give the later UX tracks a baseline and a gate.

## Non-Goals

- New features, new layouts, or a new palette.
- Changes to `DESIGN.md` tokens, except where a token fails contrast (FR2).
- A hosted accessibility service or any network call.

## Functional Requirements

### FR1: UX gate script

- Add `tools/e2e/ux-gates.mjs`. It reuses the walkthrough fixtures: fake ASR, temporary HOME, generated media.
- It drives the core flow: create, import, transcribe, delete three words, export.
- It records the clicks and key presses for each step in a JSON report.
- It fails when a step exceeds its budget in `tools/e2e/ux-budgets.json`.
- It measures page scroll at 1440x900, 1280x800, and 1024x700 in each mode.
- It counts Tab presses from the mode bar to the first transcript word.
- It checks that each button, input, select, and textarea has an accessible name.
- It checks that each focused control shows a visible outline of at least 2px.
- It checks that one polite live region carries status news.
- It never calls a paid API and never leaves 127.0.0.1.

### FR2: Contrast

- Body text and transcript words reach 4.5:1 on their surface.
- Removed words stay readable: 4.5:1 or more, with a line-through.
- White text on the indigo active word reaches 4.5:1. Use `primary-focus` (#4F46E5) as its background if needed.
- Error text reaches 4.5:1 on `surface` and on `error-surface`.
- A pure contrast helper computes the ratios. The gate uses it on computed styles.
- A failing token is changed in `DESIGN.md` and `globals.css` in the same commit, with the reason.

### FR3: Type, spacing, and accent

- Font sizes come only from the `DESIGN.md` scale: 22, 18, 15, 14, 13, 12, and 11 px.
- Remove the 10px sizes.
- Spacing uses the 4px grid tokens.
- The brand mark uses a flat `primary` fill. Remove the gradient.
- Status badges use a 3px left border, not a filled background.
- A disabled button uses `text-tertiary` on `surface-elevated` with no indigo fill, so it never looks like a primary action.
- Capture buttons use the shared `button` classes.

### FR6: Structure

- The page has one `h1` (the project name, or "Verbal" with no project). Pane titles are `h2`; card titles are `h3`.
- Each pane is a landmark with a name: banner, navigation, browser, stage, inspector, and status.

### FR4: Copy

- Buttons and headings use Title Case.
- Work in progress ends with `…`.
- Each error message names the next step.
- Raw API text never shows alone. Map known errors to a plain message and keep the raw text in a details line.
- Placeholders show an example and end with `…`.

### FR5: One status channel

- One polite live region carries async news.
- The save state is visible text, not a second live region.
- Errors use one assertive alert in the owning pane (UX2 FR5 adds the inline alert).

## Acceptance Criteria

- `node tools/e2e/ux-gates.mjs` passes and writes `ux-report.json`.
- The report records the baseline from this review: the clicks, tab stops, and scroll for each viewport.
- No text element on the page measures below 4.5:1 in the three modes.
- A source scan finds no `font-size: 10px`, no `linear-gradient`, and no `transition: all` in `globals.css`.
- Every interactive element has an accessible name in the ARIA snapshot of each mode.
- The gate finds no disabled button with an indigo background, and a heading order with no skipped level.
- Exactly one element has `aria-live="polite"` at a time.
- `npm run check` and `npm run e2e` pass.

## Dependencies

None. The other UX tracks use this gate for their acceptance.

## Risks

- Computed-style contrast misses text drawn over video. Check the player overlay by hand.
- A strict budget can block a later valid design. Change a budget only with a reason in the track plan.
- Token changes affect every screen. Re-capture all modes after FR2.

## Verification

Run the gate with the walkthrough fixtures.
Use the shared heavy runner for the build and the browser.
Never call a paid API.
