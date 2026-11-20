# Specification: Application Shell and Workflow

## Overview

The page is a stack of eleven panels inside a 960px column, so the whole document scrolls like an article and the transcript — the thing a user works in — sits below four setup panels. This is a desktop editing tool, not a web page: the window should hold still while panes move.

## Goals

1. A viewport-locked shell: the page never scrolls; only panes scroll.
2. Three workspace modes — Ingest, Edit, Deliver — each showing only what it needs.
3. The transcript and player own the centre of the screen while editing.
4. No behaviour changes to any feature: the same actions, relocated.

## Non-Goals

- Restyling the design system: `DESIGN.md` tokens stay authoritative (charcoal surfaces, one indigo accent, Inter + JetBrains Mono, 4px grid).
- New features (scene inspector, timeline scrubbing, keyboard rebinding).
- Multi-project windows or tabs.
- Mobile layouts: this is a desktop tool; it must degrade without breaking, not become a phone app.

## Functional Requirements

### FR1: Shell
- `html`, `body` and the app root are exactly the viewport height; the document does not scroll.
- The shell is three rows: a 44px title bar, a flexible body, a 32px status bar.
- The body is three columns: a 300px rail, a fluid stage, a 380px inspector. Panes scroll internally (`overflow-y: auto`, `min-height: 0`).
- A pane with nothing to show collapses instead of holding an empty column.
- Errors and status messages render in the title/status bars, so they never push the layout.

### FR2: Modes
- A mode switcher in the title bar offers Ingest, Edit and Deliver, and the active mode is visible (`aria-pressed`).
- **Ingest:** rail = Project, Library, Media, Transcription; stage = Capture.
- **Edit:** stage = Playback, Transcript editor; inspector = Cleanup.
- **Deliver:** stage = Storyboard, Feedback; inspector = Export.
- Only the panels of the active mode are rendered visible; the others are hidden but keep their state (a mode switch must not drop a job, a selection, or an unsaved edit).

### FR3: Status
- The status bar shows the project name, media presence, transcript dirty/saving state, the active job's progress when one runs, and the last message or error.
- The explicit Save control stays reachable in Edit mode.

## Acceptance Criteria

- [ ] With a project open, the page height equals the viewport and `document.scrollingElement.scrollHeight` does not exceed the viewport in any mode.
- [ ] Switching modes never re-fetches the project or loses an unsaved transcript edit.
- [ ] The transcript editor and player are both visible in Edit without scrolling the page.
- [ ] `npm run check` and a walkthrough updated for mode navigation pass.

## Dependencies

- Existing panels and their state (complete).
- `DESIGN.md` tokens (complete).

## Risks

- Hiding panels with `display: none` does not unmount them, which is what preserves state; a future refactor to conditional rendering would silently break that.
- A fixed 300/380px chrome costs ~680px of width; below ~1000px the panes must narrow rather than overlap, so widths are clamped with `min()`.
