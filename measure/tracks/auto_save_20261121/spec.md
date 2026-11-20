# Specification: Auto-Save Transcript Edits

## Overview

Transcript edits are only written when the user presses *Save transcript*. Closing the tab or navigating away silently discards them, and the undo history makes that loss easy to miss. This track saves settled edits automatically while keeping the explicit control.

## Goals

1. Edits save automatically once they settle, without a button press.
2. Saves never overlap, and a failure leaves the document dirty with the error shown.
3. The status line reports what happened: dirty, saving, saved.

## Non-Goals

- Recovering edits that were never saved at all (a crash mid-edit); that needs a persisted draft and belongs to a later track.
- Version history or backups.
- Auto-saving anything other than the transcript (storyboard stays explicit, since it is raw JSON being typed).

## Functional Requirements

### FR1: Scheduling
- A document that is clean schedules nothing.
- A dirty document saves after `delayMs` (default 1500) of quiet; a further edit restarts the timer.
- Returns to clean (for example by undo) cancel a pending save.
- At most one save is in flight; edits made during a save schedule one follow-up.

### FR2: Status
- The status line reads *Unsaved changes* while dirty and idle, *Saving…* while a save runs, and *Saved* once it lands.
- A failed save keeps the document dirty and surfaces the message.

### FR3: Page
- The page auto-saves the transcript and keeps the explicit *Save transcript* control working.

## Acceptance Criteria

- [ ] Hook tests with fake timers cover debounce, cancel-on-clean, single-flight, and follow-up saves.
- [ ] The page shows *Saving…* and then *Saved* without a click.
- [ ] `npm run check` and `npm run e2e` pass, with the walkthrough relying on autosave for one edit.

## Dependencies

- `useTranscriptDocument` dirty tracking and `PUT /api/transcript` (complete).

## Risks

- A save racing the user's next keystroke could persist a half-made edit; the debounce plus single-flight rule makes that a deferred save, never a partial one.
