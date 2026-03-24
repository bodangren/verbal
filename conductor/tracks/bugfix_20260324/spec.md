# Specification: Fix Critical Bugs Found in Code Review

## Summary
Code review on 2026-03-24 identified 4 bugs that prevent core features from working.
These must be fixed before any new feature work.

## Bugs (in priority order)

1. **Recording save produces empty files** — `stopRecording()` returns a 0-byte Blob
2. **Recording save is extremely slow / OOM** — video data sent as JSON number array
3. **Video cutting (`apply_cuts`) always errors** — path validation fails on non-existent output file
4. **Transcription jobs get stuck** — background task silently exits without updating job status

## Acceptance Criteria
- [ ] A 10-second webcam recording can be saved and the file is playable in VLC
- [ ] `apply_cuts` successfully cuts a video file into segments
- [ ] A failed transcription job shows status "Failed" (not stuck on "Pending")
- [ ] All existing tests still pass after fixes
- [ ] New tests cover the fixed behavior
