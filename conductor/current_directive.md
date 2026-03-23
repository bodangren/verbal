# Current Directive: MVP Core - Text-to-Video Sync & Local Cutting

## Status: COMPLETE ✓
**Completed: 2026-03-23**

## Active Directive
**Establish the foundational "Verbal" workflow: local video recording, text-based editing via a synced transcript, and local FFmpeg-based cutting.**

## Scope
- **Application Scaffolding**: Setup Tauri v2 with a React/TypeScript frontend and Rust systems backend. ✓
- **Webcam Integration**: Implementation of local video recording (MediaRecorder API) saved directly to the filesystem. ✓
- **Sync Engine**: Development of the ProseMirror/TipTap editor bound to word-level timestamps. ✓
- **Local Assembly**: Building the Rust-based FFmpeg execution engine to handle the non-destructive cutting logic locally. ✓

## Success Criteria
- [x] The application successfully launches and builds on Linux.
- [x] A user can record a video from their webcam and save it.
- [x] Deleting text in the editor generates a valid FFmpeg cut command.
- [x] The final rendered output reflects the text-based edits with perfect sync.

## Timeline
Started: 2026-03-22
Completed: 2026-03-23 (MVP Core)