# Spec: Frontend Export Flow and Dialogs

Source: Fable frontend review of 2026-11-27 (F10, F15, F16, F21) at `c6dc3f4`. The older `ux_deliver_export_20261122` spec is archived and rolled into this one.

## Problem

- **F10.** Export stays enabled while a job runs; the preview buttons have no busy state; progress is the text `Job running · 42%` outside the live region (`index.tsx:1176-1187,2421-2436,2563`, `ExportControls.tsx:21-33`).
- **F15.** `MediaPicker` has no focus trap (focus left after 12 Tab presses) and focus lands on `<body>` after close. `BatchDialog` has no Escape and no initial focus, and its list does not scroll (`MediaPicker.tsx:37-52`, `BatchDialog.tsx:39-53`, `globals.css:1992-1999`).
- **F16.** One flow has four names (Deliver, Storyboard, Export, Export Storyboard). Edit has a Save button, auto-save, and the text `Save the transcript to keep it` (`TopBar.tsx:82-88`, `index.tsx:1119-1123,2018-2025,2038`).
- **F21.** The error detail is only a `title` on the status bar, so the keyboard cannot reach it (`index.tsx:2569,366-380`).

## Requirements

1. FR1. Export and preview buttons are disabled while a job runs and show a busy label. A labelled `<progress>` shows percent. Start and result go to the status region.
2. FR2. One shared dialog component on native `<dialog>` with `showModal()` serves `MediaPicker` and `BatchDialog`: focus trap, Escape closes, initial focus, focus returns to the opener, scrollable body.
3. FR3. The flow is called Export everywhere (tab, heading, button, status text). The Save button and the text clause `Save the transcript to keep it` are removed; the save dot stays.
4. FR4. Error detail is visible text (a details disclosure in the status bar) and keyboard reachable.

## Acceptance

- Component tests for each requirement fail on `c6dc3f4`, pass after.
- A keyboard-only test opens the picker, picks a file, and lands focus back on its opener.
- The UX gate finds no new failure and one `Export` name in the UI.
