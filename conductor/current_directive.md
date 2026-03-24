# Current Directive: Fix Webcam Connection Issue (Pipewire)

## Active Directive
**Diagnose and fix the webcam connection failure on Linux, which appears to be related to pipewire remote errors. Ensure the webcam can be accessed and used for recording.**

## Scope
- **Diagnosis**: Investigate pipewire-related errors when accessing webcam
- **Permissions**: Ensure Tauri/WebKit has proper device access permissions
- **Fallback**: Implement graceful error handling with user-friendly messages
- **Testing**: Verify webcam works on Linux with pipewire

## Success Criteria
- Webcam connects successfully on Linux
- Recording starts without pipewire errors
- Clear error messages if camera is unavailable
- Tests pass for webcam hook and component

## Timeline
Started: 2026-03-24
Target Completion: 2026-03-25
