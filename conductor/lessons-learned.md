# Lessons Learned

## Go + GTK4 (Current)
- **GOTK4 CSS:** Use `gdk.DisplayGetDefault()` not `gtk.DefaultDisplay()`. Widgets have `AddCSSClass()` method directly.
- **GStreamer GTK4:** `gtk4paintablesink` (from gst-plugins-bad) is required for embedded video in GTK4; `gtksink`/`gtkglsink` are GTK3 only.
- **Pipeline State:** Use `sync.RWMutex` for thread-safe state tracking in GStreamer pipelines accessed from UI callbacks.
- **Go Testing:** GStreamer tests need `XDG_RUNTIME_DIR` set; GTK tests require display connection.
- **Hardware Fallback:** Always provide graceful fallback to test sources for environments without hardware. Use `HasVideoDevice()` and `HasAudioDevice()` to detect availability.
- **Gotk4 Property Access:** Use `glib.InternObject(element).ObjectProperty("name")` to access GObject properties from GStreamer elements.
- **GTK Widget Tests:** Skip GTK widget tests when no display is available (`DISPLAY` or `WAYLAND_DISPLAY` env vars).
- **AI Provider Pattern:** Use REST APIs instead of native SDKs to avoid heavy dependencies. Factory pattern with environment-based config keeps provider selection flexible.
- **Google Speech Duration:** Google's duration format uses decimal seconds (e.g., "1.5s") not "1s500ms".
- **GTK Threading:** Use `glib.IdleAdd()` to update UI from goroutines. Never update GTK widgets directly from non-main threads.
- **Metadata Persistence:** Store transcription results alongside recordings using JSON metadata files for easy recovery and history.
- **Rewrite Review:** A rewrite can still regress completed functionality; verify the end-to-end wiring in `cmd/verbal/main.go` against the directive, not just `go test ./...`.
- **wpctl Parsing:** `strings.TrimSpace` only strips ASCII whitespace. Unicode tree-drawing characters (│├└) need explicit removal with `strings.TrimLeft` when parsing `wpctl status` output.
- **TDD for Bug Fixes:** Writing the test first exposed the wpctl parser bug immediately; the parseWpctlSources test saved debugging time.
- **Custom .env Parser:** A simple bufio.Scanner-based parser avoids the godotenv dependency. Always check os.IsNotExist and don't override existing env vars.
- **httptest for HTTP Clients:** net/http/httptest is the gold standard for testing HTTP clients in Go. Use NewProviderWithClient pattern to inject test servers.
- **OpenAI Whisper API:** Use `response_format: verbose_json` + `timestamp_granularities[]: word` for word-level timestamps. Response uses `word` (not `text`) field for individual words.
- **Google Speech Duration:** Google's duration format uses decimal seconds (e.g., "1.5s") not "1s500ms". TrimSuffix("s") then ParseFloat.
- **Retry Pattern:** Embed retry logic directly in Transcribe() method. Use IsRetryable() to decide whether to retry. Auth errors (401/403) should never retry.
- **Backoff Jitter:** Add ±25% jitter to exponential backoff to prevent thundering herd problems. Use `rand.Int63n()` for randomness.
- **Audio Extraction:** Video recordings need FFmpeg conversion to WAV (16kHz, mono, PCM16) before transcription. Use `-vn -acodec pcm_s16le -ar 16000 -ac 1` flags.
- **Binary Search for Timestamps:** O(log n) word lookup by timestamp is essential for smooth sync at 10fps. Use binary search, not linear scan.
- **Test Coverage for Simple Getters:** Even simple getter methods like `GetCurrentPosition()` and `GetCurrentWordIndexCached()` need unit tests to ensure thread-safety and correct caching behavior. Don't assume "too simple to test."
- **GTK4 Cursor:** Use `gdk.NewCursorFromName("pointer", nil)` not `gtk.NewCursor()`. Cursors are set via `widget.SetCursor()`.
- **FlowBox Scrolling:** FlowBox doesn't have `ScrollToChild()` - wrap in ScrolledWindow and manage scrolling through the parent.
- **Widget Click Signals:** Use `gtk.GestureClick` controller with `ConnectReleased()` for click handling in GTK4. `ConnectClick` doesn't exist.

## General
- **Project Stability & Restoration:** NEVER delete functional code or entire modules to fix a broken build or dependency conflict. Prioritize surgical fixes (e.g., fixing type errors, adjusting `go.mod`) over "nuclear" resets. The cost of inference and user review is high; discarding work without explicit permission is a failure of judgment.
- **CGO & Build Times:** Large C-based bindings (GTK4, GStreamer) have significant first-build overhead. If a build hangs, diagnose the toolchain (e.g., background Go downloads) rather than assuming the code is "bloated" or "broken."
- **CODE REVIEW:** Passing tests ≠ working feature. Manual QA is essential for hardware/OS-dependent features.

## Superseded (Tauri/Rust)
- Tauri v2 requires WebKitGTK 4.1 on Linux.
- FFmpeg `filter_complex` with trim+concat is cleanest for multi-segment cuts.
- `tokio::process::Command` for async FFmpeg; `std::process::Command` blocks runtime.
- Transcription job state machine: Pending → Processing → Completed/Failed/Cancelled.
- `Arc<RwLock<T>>` for shared state in Tauri commands.
