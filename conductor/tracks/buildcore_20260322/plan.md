# Implementation Plan: Build core text-to-video sync and local FFmpeg cutting

## Phase 1: Project Scaffolding [checkpoint: 10fa54e]
- [x] Task: Initialize Tauri v2 application with React and TypeScript frontend
    - [x] Write Tests: Verify Tauri build and frontend testing framework setup
    - [x] Implement Feature: Run `create-tauri-app` and configure Tailwind CSS
- [x] Task: Set up Rust backend project structure and error handling
    - [x] Write Tests: Setup Rust unit testing framework
    - [x] Implement Feature: Configure custom Rust `Result` types and logger
- [x] Task: Conductor - User Manual Verification 'Phase 1: Project Scaffolding' (Protocol in workflow.md)

## Phase 2: Frontend Editor & Player
- [x] Task: Implement webcam recording using MediaRecorder API [checkpoint: c1cdd8e]
    - [x] Write Tests: Component tests for webcam stream acquisition and recording controls
    - [x] Implement Feature: Build webcam capture UI and use Tauri IPC to save the recording locally
- [x] Task: Implement TipTap/ProseMirror text editor component [checkpoint: d80959b]
    - [x] Write Tests: Component tests for editor rendering and state updates
    - [x] Implement Feature: Build the rich-text editor component with mock transcript data
- [x] Task: Implement HTML5 video player component synced to editor [checkpoint: 0ac26b8]
    - [x] Write Tests: Verify playhead sync logic
    - [x] Implement Feature: Map mock word-level timestamps to video `currentTime`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Frontend Editor & Player' (Protocol in workflow.md)

## Phase 3: FFmpeg Integration
- [ ] Task: Build Rust module to parse JSON cut lists
    - [ ] Write Tests: Unit tests for converting deleted text spans to video timecodes
    - [ ] Implement Feature: Add IPC command for frontend to send cut lists
- [ ] Task: Implement local FFmpeg execution in Rust
    - [ ] Write Tests: Mock `std::process::Command` to verify FFmpeg argument generation
    - [ ] Implement Feature: Spawn FFmpeg child process, trim segments, and concatenate output
- [ ] Task: Conductor - User Manual Verification 'Phase 3: FFmpeg Integration' (Protocol in workflow.md)