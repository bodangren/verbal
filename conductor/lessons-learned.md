# Lessons Learned

## Go + GTK4 (Current)
- **GOTK4 CSS:** Use `gdk.DisplayGetDefault()` not `gtk.DefaultDisplay()`. Widgets have `AddCSSClass()` method directly.
- **GStreamer GTK4:** `gtk4paintablesink` (from gst-plugins-bad) is required for embedded video in GTK4; `gtksink`/`gtkglsink` are GTK3 only.
- **Pipeline State:** Use `sync.RWMutex` for thread-safe state tracking in GStreamer pipelines accessed from UI callbacks.
- **Go Testing:** GStreamer tests need `XDG_RUNTIME_DIR` set; GTK tests require display connection.

## General
- **CODE REVIEW:** Passing tests ≠ working feature. Manual QA is essential for hardware/OS-dependent features.
- **DEBUGGING:** When an API setting exists in bindings but has no effect, check if the underlying C library was compiled with the feature enabled.

## Superseded (Tauri/Rust)
- Tauri v2 requires WebKitGTK 4.1 on Linux.
- FFmpeg `filter_complex` with trim+concat is cleanest for multi-segment cuts.
- `tokio::process::Command` for async FFmpeg; `std::process::Command` blocks runtime.
- Transcription job state machine: Pending → Processing → Completed/Failed/Cancelled.
- `Arc<RwLock<T>>` for shared state in Tauri commands.
