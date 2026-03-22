# Implementation Plan: Build core text-to-video sync and local FFmpeg cutting

## Phase 1: Project Scaffolding
- [ ] Task: Initialize Tauri v2 application with React and TypeScript frontend
    - [ ] Write Tests: Verify Tauri build and frontend testing framework setup
    - [ ] Implement Feature: Run `create-tauri-app` and configure Tailwind CSS
- [ ] Task: Set up Rust backend project structure and error handling
    - [ ] Write Tests: Setup Rust unit testing framework
    - [ ] Implement Feature: Configure custom Rust `Result` types and logger
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Project Scaffolding' (Protocol in workflow.md)

## Phase 2: Frontend Editor & Player
- [ ] Task: Implement TipTap/ProseMirror text editor component
    - [ ] Write Tests: Component tests for editor rendering and state updates
    - [ ] Implement Feature: Build the rich-text editor component with mock transcript data
- [ ] Task: Implement HTML5 video player component synced to editor
    - [ ] Write Tests: Verify playhead sync logic
    - [ ] Implement Feature: Map mock word-level timestamps to video `currentTime`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Frontend Editor & Player' (Protocol in workflow.md)

## Phase 3: FFmpeg Integration
- [ ] Task: Build Rust module to parse JSON cut lists
    - [ ] Write Tests: Unit tests for converting deleted text spans to video timecodes
    - [ ] Implement Feature: Add IPC command for frontend to send cut lists
- [ ] Task: Implement local FFmpeg execution in Rust
    - [ ] Write Tests: Mock `std::process::Command` to verify FFmpeg argument generation
    - [ ] Implement Feature: Spawn FFmpeg child process, trim segments, and concatenate output
- [ ] Task: Conductor - User Manual Verification 'Phase 3: FFmpeg Integration' (Protocol in workflow.md)