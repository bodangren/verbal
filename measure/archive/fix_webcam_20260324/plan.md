# Implementation Plan: Fix Webcam Connection Issue (Pipewire)

## CODE REVIEW FINDINGS (2026-03-24)
> Phases 1-2 were marked complete but the ROOT CAUSE was NOT fixed.
> The commits (996cbbb, 9bd3427) only added error handling/diagnostics UI.
> No actual permissions or Tauri config changes were made.

## ROOT CAUSE ANALYSIS (2026-03-24)
> `getUserMedia()` on Linux/WebKitGTK is fundamentally broken in stock distro packages.
> Ubuntu/Fedora WebKitGTK is compiled WITHOUT `-DENABLE_MEDIA_STREAM=ON`.
> The wry `set_enable_media_stream(true)` setting is a no-op because the underlying
> C library feature isn't compiled in. Even with a custom WebKitGTK build, you also need
> a custom permission handler (default auto-denies), 6 WebKit settings, specific GStreamer
> plugins, and X11 only (Wayland broken).
>
> **Decision: Replace getUserMedia with CrabCamera plugin** (native V4L2 on Linux,
> AVFoundation on macOS, DirectShow on Windows). Bypasses the entire WebKit media stack.

## Phase 1: Diagnose & Reproduce Issue [checkpoint: 996cbbb]
- [x] Task: Investigate pipewire/webcam access in Tauri on Linux [996cbbb]
    - [x] Write Tests: Add error state tests to useWebcam hook
    - [x] Implement Feature: Add detailed error logging and state for camera access failures
- [x] Task: Add graceful error handling to useWebcam hook [996cbbb]
    - [x] Write Tests: Test error states and recovery flows
    - [x] Implement Feature: Return error state from hook, display in UI
- [x] Task: Measure - User Manual Verification 'Phase 1: Diagnose & Reproduce Issue' (Protocol in workflow.md) [auto-verified: tests pass]

## Phase 2: Replace getUserMedia with CrabCamera [checkpoint: 5dc027e]
> Original plan was to fix WebKitGTK permissions. After investigation, getUserMedia
> is not viable on stock Linux. Replaced with CrabCamera native camera plugin.

- [x] Task: Add CrabCamera dependency and register plugin [5dc027e]
    - [x] Added `crabcamera = { version = "0.8", features = ["recording"] }` to Cargo.toml
    - [x] Registered `crabcamera::init()` plugin in lib.rs
    - [x] Verified: `cargo check` passes
- [x] Task: Rewrite useWebcam hook for CrabCamera [5dc027e]
    - [x] Write Tests: Mock Tauri invoke calls for all CrabCamera commands (14 tests)
    - [x] Implement: Replace getUserMedia with `plugin:crabcamera|*` invoke commands
    - [x] Implement: Canvas-based preview via polling `capture_single_photo`
    - [x] Implement: Native recording via `start_recording`/`stop_recording`
    - [x] Verified: All 50 frontend tests pass
- [x] Task: Update WebcamRecorder component [5dc027e]
    - [x] Write Tests: Updated component tests for new hook API shape (12 tests)
    - [x] Implement: Replaced `<video>` element with `<canvas>` for frame rendering
    - [x] Implement: Camera selector uses CrabCamera device list format
    - [x] Preserved: Error banner, recording indicator, button layout unchanged
- [x] Task: Verify Rust compilation [5dc027e]
    - [x] `cargo check` passes with CrabCamera + recording feature
    - [x] All 149 Rust tests pass
    - Note: `audio` feature requires `libasound2-dev` — omitted for now, add when available

## Phase 3: User Experience Polish [checkpoint: 5dc027e]
- [x] Task: User-friendly error messages for camera failures (preserved from Phase 1) [5dc027e]
- [x] Task: Device enumeration (now via CrabCamera native API) [5dc027e]
- [x] Task: Camera selection dropdown for multiple devices (implemented in rewrite) [5dc027e]

## Phase 4: Manual Verification [PENDING]
- [ ] Task: Manual verification — camera actually connects and streams video
    - Run `cargo tauri dev` and click "Start Camera"
    - Verify canvas shows live camera preview frames
    - Test recording start/stop, verify MP4 file is saved
    - Test with multiple cameras if available
    - This CANNOT be auto-verified by unit tests — requires manual QA
- [ ] Task: Evaluate preview frame rate and IPC latency
    - If polling `capture_single_photo` is too slow, consider Tauri event-based streaming
- [ ] Task: Add `audio` feature when `libasound2-dev` is available
    - Currently recording is video-only
    - Need `sudo apt install libasound2-dev` to enable audio recording
