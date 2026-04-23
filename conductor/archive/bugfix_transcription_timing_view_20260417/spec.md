# Spec: Transcription Result Usability and Persistence

## Problem

Manual testing shows completed OpenAI transcription text appears in the editable text field, but timing information is not clear. The app is expected to retain word-level timestamps for sync, seeking, selection, and export.

Code inspection found the completed result creates a populated stack child named `words-view`, while the toolbar toggles the original `words` child. That means the timing view is either empty or difficult to reach.

Manual testing also showed the playback window can be taller than the laptop screen and effectively not resizable, and completed transcriptions are gone after closing/reopening. The reload failure is explained by a metadata mismatch: transcription save writes `<video>.meta.json` with the `transcription.Metadata` schema, while `RecordingLoader` looks for `<video-without-ext>.json` with a different legacy schema.

## Acceptance Criteria

- Completed transcription still shows editable transcript text by default.
- A clear timing/word view control is visible after transcription completes.
- The timing/word view displays the populated word labels from the current result.
- Selecting word ranges for export continues to use the populated word data.
- The playback window starts at a laptop-friendly size and is explicitly resizable.
- Saved `<video>.meta.json` transcription metadata reloads when the file is opened again.
- Legacy `<video-without-ext>.json` metadata remains supported if practical.
- Existing transcription error copyability remains unchanged.

## Constraints

- GTK4/libadwaita UI remains the implementation surface.
- No direct FFmpeg calls.
- Keep scope limited to successful transcription result usability, sizing, and persistence.
