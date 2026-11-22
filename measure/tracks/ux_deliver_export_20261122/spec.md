# Specification: Deliver Strip and Export Panel

## Problem

Deliver shows a list of scene ids and time ranges, not a storyboard. Scenes have no thumbnail and no selection.
Export shows "Job running · 0%" as one line of muted text. There is no progress bar and no Cancel.
The done state shows the path as status text only. The error state shows raw server text.
The Title field defaults to "Untitled" though the project has a name.
The export panel also shows the last job of any kind, so a finished transcription reads as "Job done · 100%" under Export.
Three expert panels (storyboard JSON, generate assets, patch JSON) sit open to every user in the stage.
See [the UX review](../../review-ux-2026-11-22.md), findings U06, U07, U19, and U20,
and the target screen `target-deliver.jpg`.

## Goals

1. Show the storyboard as a strip of scene cards that the user can select.
2. Make export a panel with clear states: ready, running with progress and Cancel, done, and failed.
3. Fill sensible defaults from the project.
4. Move expert tools behind one Advanced control.

## Non-Goals

- The composed, playable preview. `deliver_preview_20261122` owns it. This track keeps a player slot for it.
- Editing scene fields. `deliver_preview_20261122` FR2 owns the field editor. This track gives it the selection and the inspector place.
- Scene reorder by drag. It needs a storyboard reorder operation first.
- New export presets.

## Functional Requirements

### FR1: Storyboard strip

- The strip shows one card per scene in order: a thumbnail, the kind (Title, Talk, Slide, Image, Video, Outro), a label, and the duration in mono.
- Title and outro brand steps show as cards at the ends, marked as brand.
- A card is a button in a `role="listbox"` strip with arrow-key movement. The selected card has an indigo border.
- A talk thumbnail is a frame from the source at the scene start. A cached endpoint serves it.
- A scene with a missing asset shows a placeholder card with the reason.
- The total duration shows under the strip.

### FR2: Selected scene

- Selecting a card shows its kind, start, end, and anchor words in the inspector, above Export.
- Selecting a talk card seeks the player slot to the scene start.
- The field editor slot is empty until `deliver_preview_20261122` fills it.

### FR3: Export panel

- Fields: Preset, Output File with a Choose… button that opens a folder picker, Title, Outro, Contact.
- Title defaults to the project name. Contact defaults to the last value used, kept in localStorage.
- The Export button is disabled with a reason when the storyboard has no scenes.
- Running: a progress bar with `role="progressbar"`, the step text ("Encoding segment 3 of 6"), the percent, the elapsed time, and Cancel.
- Done: the file name, the full path with a Copy Path button, the duration, and the size.
- Failed: the failed step, a plain message, a details line with the raw text, and Retry.
- Cancelled: "Export cancelled. No file was written." Only when the job reports that.
- An existing output file needs a confirm step: Replace or Choose Another Name.
- The panel shows only export jobs of the open project. A transcription or capture job never shows there.
- A failed export reaches the status bar and the pane alert. A failed job is an error, not a quiet line.
- Long error text wraps inside the panel. Nothing overflows the inspector.

### FR4: Advanced

- One "Advanced" button opens a drawer with Storyboard JSON, Generate Assets, and Review Feedback.
- Generate Assets keeps the estimate-before-generate rule. No paid call without the estimate step.
- The drawer is closed by default and remembers its state.

## Acceptance Criteria

- An e2e step opens Deliver, creates the storyboard, and finds one card per scene plus two brand cards.
- An e2e step moves through the strip with arrow keys and finds the inspector show each scene.
- An e2e step starts an export and finds a progressbar whose value rises, and a step text.
- An e2e step cancels a running export, finds the cancelled state, and finds no output file.
- An e2e step exports to an unwritable path and finds the failed state with Retry and a next step.
- An e2e step exports twice to one path and finds the Replace confirm.
- An e2e step transcribes, opens Deliver, and finds no job text in the export panel.
- An e2e step forces an export failure and finds the error in the status bar, with no horizontal overflow in the inspector.
- The Title field shows the project name on a new project.
- The UX gate measures Deliver to a finished export in 3 clicks or less (baseline in the review).
- `npm run check`, `npm run e2e`, and the UX gate pass.

## Dependencies

- `job_lifecycle_20261122`. Cancel must stop the real FFmpeg and renderer work, and progress must arrive by job events.
  A Cancel button that does not stop work would mislead the user (F06, F10).
- `save_export_integrity_20261122`. The Replace confirm needs isolated job output and no overwrite of inputs (F05).
- `ux_shell_flow_20261122` for the top bar Export entry and the pane alert.

## Risks

- Thumbnails add a new media endpoint. It must use the path adapter from `local_safety_20261122`.
- A strip of many scenes needs horizontal scroll. Keep it keyboard-reachable.
- The player slot stays empty until `deliver_preview_20261122` lands. Show a clear placeholder, not a fake preview.

## Verification

Use the walkthrough fixtures and generated media.
Use the shared heavy runner for the build, exports, and the browser.
Never call a paid API.
