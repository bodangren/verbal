# Technology Stack: Verbal

> **Decision record — 2026-11-20.** The GTK4 + GStreamer + Go implementation is retired and will be rewritten. Rationale and the rejected alternatives are recorded at the bottom of this file.

## Core Architecture

- **Language:** TypeScript, `strict` mode, ESM only
- **Runtime:** Node.js 24 (LTS)
- **Meta-framework:** vinext (Next.js API surface on Vite), **Pages Router**, client-first
- **UI:** React 19
- **Routing/API:** file-system routes under `pages/` and `pages/api/`
- **Server:** Node, built as a vinext `output: "standalone"` bundle (`node dist/standalone/server.js`)
- **Media engine:** FFmpeg + ffprobe, invoked as subprocesses with argv arrays
- **Slides/motion graphics:** Remotion compositions, previewed with `@remotion/player`
- **Storage:** JSON project documents + optional `node:sqlite` index
- **Tests:** Vitest + Testing Library
- **Package manager:** npm workspaces (`package.json` `workspaces` is the source of truth; `pnpm-workspace.yaml` is kept for compatibility)

## Why These Choices

### vinext over Next.js or TanStack Start
The app is a local, single-user, client-heavy editor. SSR, RSC, streaming, and edge deployment buy nothing. vinext keeps the Next.js routing model on Vite, builds fast, emits a standalone Node server, and uses Vitest — which is the same toolchain the media and storyboard packages need. TanStack Start and Next.js both add server-rendering machinery this app never uses.

**Constraint:** use the **Pages Router**, not the App Router. vinext's App Router development environment can fail on native Node modules (`sharp`, `@napi-rs/canvas`, and similar). The Pages Router avoids that environment entirely, and the app needs nothing RSC provides.

### Process model: there is no separate backend

`pages/api/*` handlers run in the **same Node process** as the application. `vite dev` mounts them as dev-server middleware; `node dist/standalone/server.js` serves both the app and the API in production. No second port, no IPC, no CORS layer, no separate service to start.

Handlers stay thin — parse input, call a `packages/*` function, respond. The seam is the package boundary, not HTTP, so a future CLI or Electron main process can reuse the same code without going through the network.

### React over a native toolkit
Remotion is React. A React UI means `@remotion/player` renders storyboard previews from the *same* components that render the final video — no render-then-watch round trip, and no second description of the visual. It also makes transcript editing (word spans, selection, highlighting) a solved problem instead of 8,000 lines of widget plumbing.

### FFmpeg over GStreamer
FFmpeg's filtergraph language covers everything this product needs as declarative, testable configuration rather than imperative pipeline construction:

| Need | FFmpeg |
| --- | --- |
| Chroma key | `chromakey`, `despill` |
| Speaker over slide / inset / side-by-side | `scale`, `overlay` |
| Music bed with ducking | `amix`, `sidechaincompress` |
| Loudness target | `loudnorm` |
| Transitions | `xfade` |
| Cuts and concatenation | `segment` + `concat`, `-c copy` where possible |
| Preview thumbnails / waveforms | `thumbnail`, `showwavespic` |

Filtergraphs are built by **pure TypeScript functions** that return an argv array. They are unit-testable with no display, no hardware, and no CGo.

### Webcam capture: browser MediaRecorder, FFmpeg normalizes

**Decision record — 2026-11-23.** A webcam take is captured in the browser from the same
`getUserMedia` stream the preview shows, then uploaded and normalized to MP4 by FFmpeg.
The server-side `v4l2` capture remains available for headless and hardware checks but is no
longer the interactive path.

Rationale: one camera consumer avoids the V4L2 contention between the live preview and
FFmpeg; the preview stays live; the user stops the take exactly. FFmpeg remains the single
encoder, so the rest of the pipeline still sees one MP4/H.264/AAC format.

Trade-offs: browser codec support varies (VP9/VP8 WebM, MP4 on Safari), so every take is
normalized. The upload endpoint must validate size, MIME, and project-root containment.
`packages/takes` is added for script beats, take alignment, the review schema, take
manifests, and the EDL.

### Storage: JSON documents + optional SQLite
Transcripts, storyboards, and edit lists are **documents**: versioned, diffable, patchable. They live as JSON in the project folder. A SQLite index (`node:sqlite`, built into Node) is optional and only for library-wide queries, caches, and job state. If `node:sqlite` proves too experimental, `better-sqlite3` is the fallback — but it must never be imported into a component or RSC path.

### Motion graphics: Remotion as a local child process

Remotion compositions live in `tools/remotion` and are rendered to alpha-preserving PNG sequences. The renderer runs as a Node child process, so a long render cannot block the API server, and Remotion is imported only inside that subproject — no Remotion type appears in application code.

`@remotion/renderer` drives the system Chrome (`/usr/bin/google-chrome` by default, `VERBAL_CHROME` to override), so the project does not download its own Chromium. That matters here: the development machine runs close to full, and a per-project browser download would be ~150 MB. If the system browser is ever absent, record the download cost before relying on it.

Licensing: personal use only, so Remotion's free tier applies (storyboard spec, OD2). Revisit if distribution ever becomes a goal.

Measured (2026-11-20): three 1-second steps at 320×180 render, composite, and concatenate in about 10.6 s, dominated by bundle and browser startup. Re-measure at 1080p before making any preview-latency promise.

## Package Layout

```
apps/web            vinext app: pages/, pages/api/, UI components
packages/core       project format, storage, migrations, atomic writes
packages/media      ffprobe parsing, filtergraph builders, FFmpeg runner
packages/storyboard storyboard IR, anchor resolution, patches/diff
packages/takes      script beats, take alignment, review schema, EDL
packages/slides     Remotion compositions + Player wrappers
packages/ai         ASR + LLM provider abstraction (no vendor SDKs outside)
tools/remotion      Remotion render entry point (Node CLI, frames out)
```

Local ASR engines: Typhoon ASR Realtime (Thai, 114M, ONNX through
`onnxruntime-node`, CC-BY-4.0) with whisper.cpp as the multilingual fallback.
The Typhoon mel frontend and RNNT decode are TypeScript ports of the reference
`pythaiasr` implementation; model weights are fetched separately, never bundled.

## Non-Functional Requirements

- **Local-first:** every render and every media operation is local. Cloud is used only for ASR, LLM planning, and (later) generated assets.
- **No shell interpolation:** FFmpeg is invoked with `execFile`/`spawn` and an argv array. `shell: true` is forbidden. All paths are validated before they reach a subprocess.
- **Determinism:** identical inputs produce identical filtergraphs and, modulo encoder metadata, identical output. Filtergraph builders are pure and snapshot-tested.
- **Test speed:** the full unit suite runs in seconds. Nothing needs a display, a GPU, or CGo.
- **Failure isolation:** a missing FFmpeg, a missing Remotion sidecar, or a failed render degrades to a clear error, never a hang.

## Security Rules (carried forward, adapted)

- Sanitize and validate every user-supplied path before passing it to FFmpeg.
- Filtergraph values are escaped with a dedicated escaper — filtergraph syntax has its own quoting rules and is a genuine injection surface.
- No hardcoded secrets. Provider keys come from environment or a local keychain.
- The Remotion sidecar runs with pinned dependencies and no ambient credentials.

## Licensing

Personal use only. Remotion's free tier covers individuals, FFmpeg's GPL/LGPL builds are fine without distribution, and vinext/Vite/React are permissive. If distribution ever becomes a goal, revisit the Remotion *Automators* tier and FFmpeg build flags first.

## Superseded (2026-11-20)

### What was retired
- Go 1.25 application core (`cmd/`, `internal/`)
- GTK4 + Libadwaita via `gotk4`
- GStreamer pipelines via `gotk4-gstreamer`
- SQLite via `modernc.org/sqlite`

### Why
1. **Go ↔ C boundary.** ~2 min/package CGo rebuilds, `gotk4` API drift, `gstreamer1.0-plugins-bad` as a runtime dependency.
2. **GTK as an application framework.** `internal/ui` reached 8,318 LOC — more than every other package combined — almost entirely widget plumbing.
3. **GStreamer as an editor.** It is a streaming engine, not a timeline or compositing toolkit.
4. **Duplicated runtime.** Remotion already required Node and Chromium, so the Go/GTK shell was a third platform to maintain.

### Alternatives rejected
- **Tauri / Wails + React:** on Linux both render through WebKitGTK, which is built on GTK and uses GStreamer for media. That reintroduces the retired stack and weakens H.264/AAC support.
- **Rust + egui/iced:** rebuilds text editing, layout, and video preview from scratch.
- **Next.js:** SSR/RSC machinery with no local application.
- **TanStack Start:** same, plus a server model that does not fit long-running local jobs.
- **Keep the Go core behind a React UI:** viable, but it means two languages and a process boundary for ~4.5k LOC that is faster to re-express than to port.
- **Native Lottie/SVG renderer (ThorVG/rlottie):** would avoid Node and Chromium, but has weaker authoring ergonomics than Remotion and no React ecosystem. Revisit only if packaging becomes painful.
