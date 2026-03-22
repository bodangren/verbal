# AGENTS.md

## Architectural Mandates
- **Local-First Media:** All heavy video/audio processing (FFmpeg, DSP) MUST happen in the Rust backend, never the frontend.
- **Provider Agnostic:** AI features MUST use the abstraction layer in `src-tauri/src/ai/`. No direct imports of OpenAI/Google SDKs outside this module.
- **Safety:** Sanitize all user-provided strings before passing to FFmpeg or shell commands.
- **State:** Prefer Tauri's `State` for cross-command data sharing; minimize global Rust variables.
- **Conductor Workflow:** Always update `conductor/tracks.md` and the current track's `plan.md` before starting work.
- **Performance:** UI updates for transcription/sync MUST be debounced to prevent React render-bottlenecks during playback.
- **Linux Focus:** Test all FFmpeg flags for compatibility with standard Linux distributions (Ubuntu/Fedora).
- **Componentizing:** App.tsx should not be monolithic. Keep its total size down by componentizing.
