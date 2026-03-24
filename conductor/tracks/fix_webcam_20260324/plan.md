# Implementation Plan: Fix Webcam Connection Issue (Pipewire)

## CODE REVIEW FINDINGS (2026-03-24)
> Phases 1-2 were marked complete but the ROOT CAUSE was NOT fixed.
> The commits (996cbbb, 9bd3427) only added error handling/diagnostics UI.
> No actual permissions or Tauri config changes were made.
> See "Phase 2 REDO" below for what still needs to happen.

## Phase 1: Diagnose & Reproduce Issue [checkpoint: 996cbbb]
- [x] Task: Investigate pipewire/webcam access in Tauri on Linux [996cbbb]
    - [x] Write Tests: Add error state tests to useWebcam hook
    - [x] Implement Feature: Add detailed error logging and state for camera access failures
- [x] Task: Add graceful error handling to useWebcam hook [996cbbb]
    - [x] Write Tests: Test error states and recovery flows
    - [x] Implement Feature: Return error state from hook, display in UI
- [x] Task: Conductor - User Manual Verification 'Phase 1: Diagnose & Reproduce Issue' (Protocol in workflow.md) [auto-verified: tests pass]

## Phase 2: Fix Permissions & Configuration [NEEDS REDO]
> **REVIEW NOTE:** Phase 2 was marked complete at 9bd3427 but NO actual
> permission/config changes were made. The commit only added device
> enumeration and enhanced error messages. The tasks below describe
> what ACTUALLY needs to happen.

- [ ] Task: Fix Tauri capabilities for media device access
    - `src-tauri/capabilities/default.json` only has `core:default` and `opener:default`
    - Need to investigate if Tauri v2 has a media/webcam permission plugin or capability
    - If not, may need a custom Tauri plugin or WebKit feature-policy configuration
- [ ] Task: Fix WebKitGTK getUserMedia on Linux
    - WebKitGTK may not support getUserMedia out of the box on Linux
    - Check if PipeWire portal access is needed (xdg-desktop-portal)
    - Check WebKitGTK feature flags for media capture: `enable-media-stream`
    - May need `webkit2gtk` build flags or GStreamer pipewire plugin
    - Test with `WEBKIT_DISABLE_COMPOSITING_MODE=1` env var
- [ ] Task: Manual verification — camera actually connects and streams video
    - Run the app with `cargo tauri dev` and click "Start Camera"
    - Verify the video preview shows a live camera feed
    - This CANNOT be auto-verified by unit tests — requires manual QA

## Phase 3: User Experience Polish
> NOTE: Phase 3 tasks for error messages and device enumeration were
> actually implemented in Phases 1-2 (commits 996cbbb, 9bd3427).
> Remaining work is camera selection UI.

- [x] Task: Add user-friendly error messages for camera failures (done in 996cbbb)
- [x] Task: Add device enumeration (done in 9bd3427)
- [ ] Task: Add camera selection dropdown for multiple devices
    - [ ] Write Tests: Test device selection UI and passing deviceId to getUserMedia
    - [ ] Implement Feature: Allow user to select from available cameras via dropdown
    - Currently `startCamera()` calls `getUserMedia({ video: true, audio: true })` with no deviceId constraint
- [ ] Task: Conductor - User Manual Verification 'Phase 3: User Experience Polish' (Protocol in workflow.md)
