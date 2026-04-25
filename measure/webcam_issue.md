# Webcam Issue: getUserMedia Fails on Linux — Full Investigation

## TL;DR

`navigator.mediaDevices.getUserMedia()` fails instantly with "Permission denied" in our Tauri v2 app on Linux. After two rounds of investigation, the root cause is **not just a missing wry setting** — the system WebKitGTK package isn't compiled with media stream support. We have two paths forward and need a decision.

## Investigation Timeline

### Round 1: System-Level Checks (all passed)
- Hardware: Camera detected by PipeWire (`media.class = "Video/Source"`)
- Dependencies: `gstreamer1.0-pipewire`, `webkit2gtk-4.1` v2.50.4, `xdg-desktop-portal` all present
- GNOME Settings: `disable-camera = false`
- Portal API: `org.freedesktop.portal.Camera` interface exists, `AccessCamera()` returns a request path

### Round 2: wry Settings Patch (failed)
Identified that wry 0.54.4 never calls `set_enable_media_stream(true)` in `set_webview_settings()`. Patched the cargo registry source directly:
```rust
settings.set_enable_media_stream(true);
settings.set_enable_media(true);
```
Ran `cargo clean -p wry` and rebuilt. **Same error, no change.**

### Round 3: Deeper Research (current)

Found [Tauri Discussion #8426](https://github.com/tauri-apps/tauri/discussions/8426) where someone actually got WebRTC/getUserMedia working on Linux. It required **all of the following**:

1. **Custom WebKitGTK build** with compile flags:
   ```
   -DENABLE_MEDIA_STREAM=ON
   -DENABLE_WEB_RTC=ON
   ```
   The standard distro package (Ubuntu/Fedora) does NOT include these. The wry settings API exists but the underlying WebKit feature isn't compiled in — the setting is a no-op.

2. **Six wry settings** (not just two):
   ```rust
   settings.set_enable_webrtc(true);
   settings.set_enable_media_stream(true);
   settings.set_enable_mediasource(true);
   settings.set_enable_media(true);
   settings.set_media_playback_requires_user_gesture(false);
   settings.set_media_playback_allows_inline(true);
   ```

3. **Custom WebKit permission handler** — the default handler auto-denies all permission requests silently (this explains why no portal dialog ever appeared)

4. **GStreamer plugins**: `gst-plugins-good`, `gst-plugins-base`, AND `gst-plugins-bad` (contains WebRTC components)

5. **X11 only** — Wayland produced GBM buffer errors

This explains why the patch alone didn't work. The setting exists in the webkit2gtk Rust bindings but the underlying C library feature was never compiled into the system package.

## Two Paths Forward

### Option A: CrabCamera Plugin (recommended)

[CrabCamera](https://github.com/Michael-A-Kuykendall/crabcamera) is a Tauri plugin that **bypasses getUserMedia entirely** and uses native OS camera APIs:
- **Linux**: V4L2 (direct kernel interface — no WebKit, no portal, no GStreamer)
- **macOS**: AVFoundation
- **Windows**: DirectShow

Pros:
- Works with stock system packages, no custom WebKitGTK build
- Cross-platform with one API
- Includes hardware controls (focus, exposure, white balance)
- Eliminates the entire WebKit media permission stack from the equation

Cons:
- New dependency to evaluate (maturity, maintenance, API stability)
- Need to rewrite `useWebcam.ts` to use Tauri commands instead of `getUserMedia`
- Camera frames come through Rust → IPC → frontend (need to evaluate latency for live preview)
- We lose browser-native MediaRecorder — recording would need to happen on the Rust side or we pipe frames to a canvas

### Option B: Custom WebKitGTK Build

Keep `getUserMedia` approach but build WebKitGTK from source with media stream flags.

Pros:
- Keeps existing frontend code (`useWebcam.ts`, MediaRecorder)
- Proven to work (per Discussion #8426)

Cons:
- Requires users (and CI) to have a custom WebKitGTK build — massive packaging burden
- X11 only (Wayland broken) — most distros are moving to Wayland by default
- Fragile: depends on specific GStreamer plugin versions
- Need to maintain a wry fork with 6 setting changes + permission handler
- Not cross-platform — macOS/Windows would need entirely different handling anyway

## Decision Needed

1. **Which path?** CrabCamera (Option A) seems like the right call — fighting WebKitGTK's media stack is a rabbit hole, and we need cross-platform eventually anyway. But want your sign-off before we add a new dependency and rewrite the webcam hook.

2. **If CrabCamera**: Should I evaluate its API first and write up an integration plan, or just start building?

3. **If custom WebKitGTK**: Are we okay with X11-only and the packaging complexity? Do we Dockerfile the build?

## References
- [Functional WebRTC in WebkitGTK on Linux — Tauri Discussion #8426](https://github.com/tauri-apps/tauri/discussions/8426)
- [WebRTC support on Linux — wry Issue #85](https://github.com/tauri-apps/wry/issues/85)
- [CrabCamera — GitHub](https://github.com/Michael-A-Kuykendall/crabcamera)
- [CrabCamera — crates.io](https://crates.io/crates/crabcamera)
- [wry Issue #1195 — getUserMedia permission prompt](https://github.com/tauri-apps/wry/issues/1195)

---

## Senior Dev Response (2026-03-24)

Good work tracing this all the way down to the WebKitGTK compile flags. That's the right conclusion — the wry patch was a reasonable first hypothesis but you correctly identified why it's a no-op on stock distro packages.

### Decision: Option A — CrabCamera

Option B is a non-starter. Requiring a custom WebKitGTK build means every developer, every CI runner, and every end user needs it. That's not a product, that's a science project. And X11-only in 2026 is a dealbreaker — Ubuntu defaulted to Wayland two releases ago.

CrabCamera is the right call. V4L2 on Linux is the correct abstraction level — it talks directly to the kernel camera driver, skipping WebKit, GStreamer, PipeWire portals, and the entire permission stack that's been blocking us. The fact that it also gives us macOS (AVFoundation) and Windows (DirectShow) for free means we don't have to solve this problem three different ways later.

### Concerns to Evaluate Before Building

Before you start rewriting `useWebcam.ts`, spend a couple hours answering these:

1. **Live preview latency.** CrabCamera frames go Rust → Tauri IPC → frontend. How are frames delivered — base64 JPEG over events? Raw bytes over a custom protocol? We need to know if we can sustain 30fps preview without melting the IPC bridge. Check their docs/examples for how they recommend rendering frames in the webview.

2. **Recording.** We currently rely on `MediaRecorder` which is a browser API. With CrabCamera, recording has to happen on the Rust side. Does CrabCamera have a recording API, or do we need to write frames to a file ourselves (e.g. pipe to FFmpeg)? We already have FFmpeg integration so this might be fine, but check.

3. **Maturity.** It's a newer crate. Check: how many GitHub stars/issues, when was last commit, does it have tests, is the V4L2 backend actually tested on recent kernels, any open bugs that would block us. If it's one person's weekend project with no tests, we should know that upfront.

4. **API surface.** We need: start/stop camera, list available devices, select a specific device, get frames for preview, start/stop recording. Map CrabCamera's API to these requirements and flag any gaps.

### What to Do

1. **Evaluate** CrabCamera against the 4 points above. Write up findings in a short doc.
2. **If it checks out**: Create a new measure track for the integration. Spec should cover replacing `useWebcam.ts` with Tauri command-based camera access, Rust-side recording, and the frontend preview pipeline.
3. **Revert the wry cache patch** — it's not doing anything and will cause confusion if someone else hits a different wry bug later.
4. **Don't touch the existing `useWebcam.ts` error handling / device enumeration code yet** — that UI work is still valid regardless of which camera backend we use.

### On the Existing Track

Mark `fix_webcam_20260324` Phase 2 as blocked/won't-fix with a note that the approach changed from "fix WebKit permissions" to "replace with native camera plugin." The new track will supersede it.
