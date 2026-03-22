# Specification: Build core text-to-video sync and local FFmpeg cutting

## Overview
This track focuses on building the foundational MVP of Verbal. We will initialize the Tauri application and implement the core feature: the ability to parse a text-based editor's cut list and use local FFmpeg to slice the video perfectly in sync with the text.

## Requirements
1. **Application Scaffolding:** Initialize a Tauri v2 application with a React/TypeScript frontend and a Rust backend.
2. **Text Editor Integration:** Embed a ProseMirror or TipTap editor in the UI.
3. **Timeline/Video Sync:** Build a custom `<video>` player that syncs its playhead with the text editor's cursor based on simulated word-level timestamps.
4. **Cut List Generation:** Calculate and generate a JSON "cut list" when text is deleted from the editor.
5. **Local FFmpeg Execution:** Build a Rust module to receive the JSON cut list from the frontend and spawn a local `ffmpeg` process to trim and concatenate the video segments.

## Out of Scope
- Actual API integration with Google/OpenAI for transcription (we will use mock timestamped data for this track to focus on the cutting logic).
- Advanced audio DSP filters.
- Complex timeline track layers.