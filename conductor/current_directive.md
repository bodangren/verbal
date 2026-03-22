# Current Directive: MVP Core - Text-to-Video Sync & Local Cutting

## Active Directive
**Establish the foundational "Verbal" workflow: local video recording, text-based editing via a synced transcript, and local FFmpeg-based cutting.**

## Scope
- **Application Scaffolding**: Setup Tauri v2 with a React/TypeScript frontend and Rust systems backend.
- **Webcam Integration**: Implementation of local video recording (MediaRecorder API) saved directly to the filesystem.
- **Sync Engine**: Development of the ProseMirror/TipTap editor bound to word-level timestamps.
- **Local Assembly**: Building the Rust-based FFmpeg execution engine to handle the non-destructive cutting logic locally.

## Success Criteria
- The application successfully launches and builds on Linux.
- A user can record a video from their webcam and save it.
- Deleting text in the editor generates a valid FFmpeg cut command.
- The final rendered output reflects the text-based edits with perfect sync.

## Timeline
Started: 2026-03-22
Target Completion: 2026-04-15 (MVP Core)