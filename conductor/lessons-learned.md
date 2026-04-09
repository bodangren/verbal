# Lessons Learned

## Go + GTK4 (Current)
- **GStreamer Real Audio Extraction:** When gotk4-gstreamer bindings don't expose appsink, use gst-launch-1.0 subprocess with `filesrc ! decodebin ! audioconvert ! audioresample ! audio/x-raw,format=S16LE,channels=1,rate=16000 ! filesink` pattern. Extract to temp file, then read/convert.
- **S16LE to Float64 Conversion:** Little-endian: `value := int16(data[offset]) | int16(data[offset+1])<<8`. Normalize to [0.0, 1.0] by taking absolute value and dividing by 32768.
- **AudioExtractor Interface Pattern:** Create interface for audio extraction to enable testing with mocks and future backend flexibility (FFmpeg, etc.).
- **Waveform Cache Schema:** Use SQLite with JSON columns for flexible sample storage. `INSERT OR REPLACE` with `ON CONFLICT` handles upserts cleanly.
- **Async Generation Pattern:** Use goroutines with progress/completion callbacks for long-running operations like waveform generation. Always call completion callback even on errors.
- **Display Detection:** Use `os.Getenv("DISPLAY")` or `os.Getenv("WAYLAND_DISPLAY")` to detect if GTK/GStreamer tests can run. Skip tests gracefully when no display available.
- **Normalization:** Audio amplitude normalization should convert negative values to absolute values before scaling to 0-1 range for waveform display.
- **Settings Singleton Pattern:** SQLite singleton table with `CHECK (id = 1)` constraint ensures exactly one settings row. Use `INSERT OR REPLACE` for upsert behavior.
- **JSON Config in SQLite:** Store nested configuration as JSON columns to avoid schema migrations when adding provider-specific fields.
- **Factory Pattern for Providers:** Create a factory implementing `settings.ProviderFactory` interface for dependency injection and testability.
- **Exact vs Fuzzy DB Lookup:** Use exact `file_path = ?` lookup for mutation targets (transcription status/data updates). Keep LIKE search only for user-facing discovery/filtering.
- **GTK ComboBoxText vs DropDown:** ComboBoxText has simpler API for basic text selection. Use `SetActive()`/`GetActive()` instead of `SetSelected()`/`Selected()`.
- **Async UI Updates:** Use `glib.IdleAdd()` to update UI from goroutines. This prevents GTK threading issues.
- **GStreamer GTK4:** `gtk4paintablesink` (from gst-plugins-bad) is required for embedded video in GTK4; `gtksink`/`gtkglsink` are GTK3 only.
- **Pipeline State:** Use `sync.RWMutex` for thread-safe state tracking in GStreamer pipelines accessed from UI callbacks.
- **GTK Widget Tests:** Skip GTK widget tests when no display is available (`DISPLAY` or `WAYLAND_DISPLAY` env vars).
- **Avoid Package-Level Test Bypass:** Do not `os.Exit(0)` in `TestMain` for headless environments; it creates false-green package results by skipping all tests silently. Gate only display-required tests with `t.Skip`.
- **Startup Smoke Gate:** Add a non-UI startup mode (for example `--smoke-check`) so CI can validate binary build plus database/service wiring without launching GTK event loop.
- **AI Provider Pattern:** Use REST APIs instead of native SDKs to avoid heavy dependencies. Factory pattern with environment-based config keeps provider selection flexible.
- **Google Speech Duration:** Google's duration format uses decimal seconds (e.g., "1.5s") not "1s500ms". TrimSuffix("s") then ParseFloat.
- **Backoff Jitter:** Add ±25% jitter to exponential backoff to prevent thundering herd problems. Use `rand.Int63n()` for randomness.
- **Binary Search for Timestamps:** O(log n) word lookup by timestamp is essential for smooth sync at 10fps. Use binary search, not linear scan.
- **GTK4 Paned Widget:** Use `gtk.Paned` for split-pane layouts. Set position with `SetPosition()` and retrieve with `Position()`.
- **GTK4 Scale (Slider):** Use `gtk.NewScaleWithRange()` for sliders. Call `SetHExpand(true)` to make it expand horizontally.
- **GTK Stack:** Use unique child names in GtkStack. Adding duplicate names causes warnings. Remove old children before adding new ones with the same name.
- **WCAG Contrast:** Semi-transparent gold (`rgba(255, 215, 0, 0.5)`) fails WCAG AA contrast. Use GNOME accent blue (`#3584E4`) with white text for reliable 4.5:1+ contrast.
- **O(1) Highlight Updates:** Track `lastHighlightedIndex` to clear only the previous word instead of iterating all words on every 10fps position update.
- **Seek Boundary Validation:** Always validate seek positions against duration before calling GStreamer's `SeekSimple`. Negative seeks cause silent failures.
- **SetState Return Values:** GStreamer's `SetState()` returns `gst.StateChangeReturn`, not an error. Check for `gst.StateChangeFailure` to detect failed transitions.
- **Integration Test Patterns:** Integration tests should test complete workflows, state transitions, and edge cases. Table-driven tests with descriptive names make test failures self-documenting.
- **Interface Changes Require Test Updates:** When adding new interface parameters (like `WaveformUpdater` to `NewIntegration`), update all test mocks and call sites immediately. Use `nil` for optional interfaces in tests.
- **Normalization Edge Cases:** Single-value normalization produces 1.0 (value/max where max=value), not the original value. Document this behavior in test expectations.
- **Viewport-Based Rendering:** For large datasets (waveforms with 100k+ samples), only render visible samples based on scroll/zoom offset. This keeps rendering O(visible) instead of O(total).
- **Zoom/Scroll Math:** When implementing zoom, calculate visible time range as duration/zoom. Scroll offset (0.0-1.0) maps to the remaining time range. Use xToTime/timeToX conversions consistently.
- **GTK Tooltip Alternative:** Complex tooltip windows with gotk4 have API compatibility issues. Simpler approach: track hover position internally and let parent UI display tooltips.

## General
- **Project Stability & Restoration:** NEVER delete functional code or entire modules to fix a broken build. Prioritize surgical fixes over "nuclear" resets.
- **CGO & Build Times:** Large C-based bindings (GTK4, GStreamer) have significant first-build overhead. If a build hangs, diagnose the toolchain rather than assuming the code is "broken."
- **CODE REVIEW:** Passing tests ≠ working feature. Manual QA is essential for hardware/OS-dependent features.
