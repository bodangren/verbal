# Tech Debt
- Need to implement proper error boundary for the text editor canvas.
- No central state management for the video player yet (using local component state).
- AppImage bundling fails on Linux with "failed to run linuxdeploy" - deb/rpm work fine. [severity: low]
- VideoPlayer currentTime sync with external prop may cause double-seek on rapid updates.
- TranscriptEditor doesn't yet support real-time word highlighting during playback.
