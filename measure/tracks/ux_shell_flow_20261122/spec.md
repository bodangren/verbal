# Specification: Shell and Core Flow

## Problem

The core flow sends the user between modes. Import lands in Edit, but Transcribe lives in Ingest.
Edit then says "Go to Ingest" to transcribe. The project browser shows only in Ingest.
The top bar has no save dot and no Export action. A reload forgets the open project.
Errors show only as one line in the status bar.
See [the UX review](../../review-ux-2026-11-22.md), findings U01, U02, U13, U14, and U15,
and the target screen `target-ingest.jpg`.

## Goals

1. Keep the project browser in every mode, as the target screens show.
2. Give the transcript most of the Edit stage, as `target-edit.jpg` shows.
3. Make import and transcription one place with visible progress.
4. Cut the clicks from a new project to an editable transcript.
5. Keep the open project and mode across a reload.
6. Show errors where the action happened, with a next step.

## Non-Goals

- Drag-and-drop upload of a file from the desktop. A browser drop gives bytes, not a path.
  An upload endpoint writes files from a browser request, so it waits for `local_safety_20261122`.
- A transcription provider switch in the UI. The environment selects the provider.
- Capture hardware work. The Record button reuses the existing capture.
- New `DESIGN.md` tokens.

## Functional Requirements

### FR1: Persistent browser

- The left pane shows the project browser in Ingest, Edit, and Deliver.
- The open project row has a 3px indigo left edge and `aria-current="true"`.
- A project row shows the name, word count, media duration in mono, and the edit age.
- The pane collapses to a 40px rail with one button. The state persists in localStorage.
- At 1024px width the pane starts collapsed.
- Opening another project with unsaved edits saves first, or asks when the save fails.

### FR2: Top bar

- The top bar shows the project name, a save dot with text (Saved, Saving…, Unsaved), and an Export button.
- Export opens Deliver and moves focus to the export panel.
- Mode buttons stay usable without a project. Each mode shows its empty state.
- The mode bar marks the current mode with `aria-current="page"`.

### FR3: Ingest stage

- The stage shows one import card: Import Media (opens the picker) and Record (opens capture).
- After a file is chosen, import starts at once. No second Import button.
- The stage lists the project's media with its state: Not Transcribed, Transcribing… with percent, Transcribed with word count, or Failed with a Retry button.
- Transcribe sits on the media row. One click starts it.
- The Batch textarea moves into a "Transcribe Several Projects" dialog. It lists the browsed folder's projects as checkboxes. No typed paths.
- The stage names the transcription provider in use: "Local (whisper)" or "Cloud (OpenAI-compatible)". Cloud states that audio leaves the machine.

### FR4: Ingest inspector

- Media details: codec, resolution, audio rate and channels, duration, and file size, from `/api/media/probe`.
- Next steps: Import, Transcribe, Open in Edit. Each step shows done or pending. Open in Edit is a button.
- When transcription ends, the status bar says so and Open in Edit gets focus only if focus was on the Transcribe button.

### FR5: Errors

- An error shows as an inline alert in the pane that owns the action, with the next step and a Dismiss button.
- The status bar keeps the last message. An error stays until dismissed or until the same action succeeds.
- Edit and Deliver empty states offer the action in place. "No transcript yet" has a Transcribe button, not "Go to Ingest".

### FR6: Session memory

- The open project root and the mode persist in localStorage.
- A reload reopens that project in that mode. A missing project falls back to the browser with a message.
- `beforeunload` warns while edits are unsaved or a job runs.

### FR7: Edit stage layout

- The Edit stage is a fixed column: player, timeline strip, then the transcript, which takes the rest of the height.
- The player height is at most 40% of the stage. A Collapse Player button shrinks it to a 64px transport row.
- Only the transcript scrolls. The player and the timeline stay in view.
- The player overlay (play glyph) hides when the video has focus or plays.

## Acceptance Criteria

- The UX gate measures new project to editable transcript in 5 clicks or less (baseline in the review: 8 clicks and a typed name).
- The UX gate measures zero page scroll in each mode at 1440x900, 1280x800, and 1024x700.
- An e2e step reloads the page in Edit and finds the same project and mode.
- An e2e step forces an import error and finds an inline alert with a next step in the Ingest stage.
- An e2e step opens Edit with no transcript and starts transcription without a mode change.
- At 1440x900 the gate counts at least 8 transcript lines in view without scroll; at 1024x700 at least 4 (baseline: 1 and 0).
- The browser pane is visible in all three modes at 1440x900; the open project row has `aria-current`.
- The ARIA snapshot names each landmark: banner, navigation, browser, stage, inspector, status.
- `npm run check`, `npm run e2e`, and the UX gate pass.

## Dependencies

- `ux_gates_20261122` for the gate and the budgets.

## Risks

- A persistent browser takes width from the transcript. The collapse rule protects 1024px.
- An automatic import after a choice can surprise. The picker's choose button says "Import".
- Autosave before a project switch can race with the save bug in F04.
  Do not claim the switch is lossless until `save_export_integrity_20261122` lands.

## Verification

Use the walkthrough fixtures and the fake ASR.
Use the shared heavy runner for the build and the browser.
Never call a paid API.
