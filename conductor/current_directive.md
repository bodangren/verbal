# Current Directive: Hardware Recording Integration

## Active Directive
**Refactor the recording pipeline to use real hardware (webcam/mic) with graceful fallback to test sources.**

## Scope
- **Device Detection**: Enumerate available video/audio capture devices
- **Hardware Pipeline**: Use v4l2src (webcam) and pulsesrc (microphone)
- **Graceful Fallback**: Test sources when hardware unavailable
- **Preview Support**: Option to preview real webcam feed

## Success Criteria
- Device detection correctly identifies available hardware
- Recording pipeline uses real webcam/mic when available
- Application gracefully falls back to test sources
- All Go tests pass
- Application runs on Ubuntu/GNOME with/without hardware

## Timeline
Started: 2026-03-26
Target Completion: 2026-03-26

## Next Steps
- Phase 1: Device Detection
- Phase 2: Hardware Pipeline Refactor
