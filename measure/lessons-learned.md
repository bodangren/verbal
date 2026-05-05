# Lessons Learned

## Go + GTK4 (Current)
- **gotk4-adwaita Bindings:** Go bindings for Libadwaita at `github.com/diamondburned/gotk4-adwaita`. Requires `adw.Init()` call after `gtk.Init()`.
- **GStreamer Real Audio Extraction:** Use gst-launch-1.0 subprocess with `filesrc ! decodebin ! audioconvert ! audioresample ! audio/x-raw,format=S16LE,channels=1,rate=16000 ! filesink` pattern.
- **Async UI Updates:** Use `glib.IdleAdd()` to update UI from goroutines. This prevents GTK threading issues.
- **Display Detection:** Use `os.Getenv("DISPLAY")` or `os.Getenv("WAYLAND_DISPLAY")` to detect if GTK/GStreamer tests can run. Skip tests gracefully with `t.Skip`.
- **Binary Search for Timestamps:** O(log n) word lookup by timestamp is essential for smooth sync at 10fps. Use binary search, not linear scan.
- **Widget Pool Pre-allocation:** For GTK virtualization, pre-allocate widget pools at construction rather than creating widgets on-demand.
- **Widget Pool Index Mapping:** In virtualized containers with fixed widget pools, pool indices don't map 1:1 to data indices. Use an offset (startIdx) when assigning data to pool slots.
- **Words Snapshot for Binary Search:** Pass words as a parameter to search methods, copying the slice under lock first to avoid data races.
- **GStreamer Pipeline Path Sanitization:** Always sanitize file paths before interpolating into GStreamer pipeline strings. Use `quoteLocation()` function that strips newlines and applies `strconv.Quote()`.
- **Callback Panic Recovery:** Always wrap user-provided callbacks with `defer recover()` in long-running goroutines.
- **Logger Interface Pattern:** Define minimal logger interfaces at the package level to avoid tight coupling to specific logging implementations.
- **SQLite BEGIN IMMEDIATE for Backups:** Use `BEGIN IMMEDIATE` transaction to obtain an exclusive lock during backup.
- **Atomic File Replacement Pattern:** For safe file updates: (1) write to temp file, (2) `fsync()` to ensure data hits disk, (3) atomic `rename()` to replace target.
- **File Permission Constants:** Use `0700` for directories and `0600` for sensitive files (backups containing user data).
- **Import/Export Manifest Pattern:** Use a versioned JSON manifest in ZIP archives for import/export. Include SHA-256 checksums for all files to verify integrity during import.
- **Resource Cleanup Pattern:** Always add resource cleanup (like `scheduler.Stop()`) to the window's `ConnectCloseRequest` handler to ensure graceful shutdown of background goroutines.
- **Dialog Reuse:** Create dialog instances on-demand in response to user actions rather than keeping them in app state.
- **Progress Callback Pattern:** Use `UpdateProgress(percent int, message string)` method for async operations. Store progress state internally for testing in headless environments.
- **Export/Import UI State Management:** Disable controls during operations (`SetExportingState`, `SetImportingState`, `SetRepairingState`) to prevent user interaction while async work is in progress.
- **Viewport-Based Rendering:** For large datasets (waveforms with 100k+ samples), only render visible samples based on scroll/zoom offset.
- **Codec Detection for Stream-Copy:** Create a CodecDetector interface to probe media files for codec parameters. Stream-copy works when source and output use the same codec family (H264/H265/VP8/VP9).
- **GStreamer pad-added Signal:** Use `ConnectPadAdded(func(newPad *gst.Pad))` on Element to receive pads as they're created by decodebin.
- **Consolidated Path Sanitization:** Create `QuoteLocation()` in `internal/media/sanitize.go` to unify path escaping for GStreamer pipelines.
- **Edit Operation Pattern:** Define an Operation interface with Apply/Undo/MarshalJSON. Concrete operations (Delete, Reorder, InsertSilence, Split) implement the interface.
- **Lifecycle Adapter Pattern:** When wiring lifecycle services to UI dialogs, create adapter types that satisfy the lifecycle interfaces using app services.
- **Filler Removal Service Pattern:** Use `RecordingProvider` interface for testability. Match filler targets by value (Start, End, Text) not pointer equality.
- **Segment Computation for Filler Removal:** Compute non-filler segments by sorting fillers by start time, then creating segments between consecutive filler boundaries.
- **FillerRemovalDialog Pattern:** Create GTK dialogs with SetOnXxx callback setters. Use glib.IdleAdd for async completion callbacks to update UI safely. Store result internally for retrieval after async operation.
- **UpdatedTranscriptionJSON Pattern:** After filler removal, compute filtered transcription by removing filler words from the word list, then marshal back to JSON for SQLite update.
- **TimestampMapper for Multi-Segment Exports:** Use cumulative offset tracking to map between local segment time and global timeline time. Essential for gapless multi-segment concatenation.
- **SegmentMarker for Waveform Visualization:** Add segment boundaries as markers on WaveformWidget using a SegmentMarker struct with Time, Label, and IsActive fields. Draw active segments in orange, inactive in gray. [NEW]
- **Multi-Track Toggle Must Wire to Visibility:** Phase completion must verify actual functionality, not just code existence. The multi-track toggle button existed but wasn't wired to control WaveformWidget segment visibility. [NEW]

## General
- **Project Stability & Restoration:** NEVER delete functional code or entire modules to fix a broken build. Prioritize surgical fixes over "nuclear" resets.
- **CGO & Build Times:** Large C-based bindings (GTK4, GStreamer) have significant first-build overhead. If a build hangs, diagnose the toolchain rather than assuming the code is "broken."
- **CODE REVIEW:** Passing tests ≠ working feature. Manual QA is essential for hardware/OS-dependent features.