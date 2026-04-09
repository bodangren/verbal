# Track Spec: Exact Recording Lookup for Transcription Updates

## Overview
The transcription flow currently uses `Search(currentPath)` and then filters in-memory to find the matching record. Because search is LIKE-based, this can return multiple rows and risks wrong-record updates when paths overlap.

## Goals
1. Add exact file-path lookup in the DB/repository/service layers.
2. Update transcription persistence flow to use exact lookup only.
3. Preserve provider-agnostic and local-first architecture.
4. Add targeted tests proving exact-match behavior.

## Requirements

### Functional
- Add repository method for exact path fetch (`WHERE file_path = ?`).
- Add service method exposing exact path lookup.
- Replace `Search(currentPath)` calls in transcription flow with exact lookup.
- Keep behavior safe when no matching record exists.

### Non-Functional
- No GTK main loop blocking changes.
- No change to media/GStreamer behavior.
- Unit tests for new repository/service methods.

## Acceptance Criteria
1. Transcription update path no longer uses LIKE search for DB write targeting.
2. A query for `/a/b/video.mp4` does not match `/a/b/video.mp4.bak`.
3. `go test ./internal/db/...` passes.
4. `go test ./...` and `go build ./...` pass.
