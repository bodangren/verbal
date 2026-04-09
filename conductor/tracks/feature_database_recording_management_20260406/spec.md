# Track Spec: Database and Recording Management

## Overview
Establish SQLite-backed persistence for recordings and integrate recording management into the app workflow. This track began the foundation and was finalized via successor tracks that delivered the full library UX.

## Goals
1. Persist recording metadata in SQLite instead of relying only on sidecar JSON.
2. Support listing and searching recordings from the app UI.
3. Ensure recording selection opens playback flows using stored metadata.
4. Keep the workflow local-first and compatible with GTK4/GStreamer architecture.

## Delivered Scope
- Database schema and repository foundation for recordings.
- App startup DB initialization and recording persistence path.
- Library view, search/filter UX, metadata display, and playback handoff.
- Follow-on thumbnail support layered onto library records.

## Reconciliation Mapping
- Foundation work: `feature_database_recording_management_20260406`
- Library and UX completion: `feature_recording_library_20260407`
- Thumbnail/display enhancements: `feature_video_thumbnails_20260409`
- Runtime verification of integrated behavior: `chore_test_truthfulness_e2e_20260409`

## Acceptance Criteria
1. Recordings are persisted in SQLite and survive app restarts.
2. Users can browse and search recordings from the library view.
3. Selecting a library item loads playback/transcription UI.
4. Tests/build validation pass for the integrated implementation.

## Closure Note
This track is marked completed through reconciliation because delivery was split across successor tracks during implementation. See `plan.md` for detailed checkbox-to-track mapping.
