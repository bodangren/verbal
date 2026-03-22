# Technology Stack: Verbal

## Core Architecture
- **Framework:** Tauri v2
- **Paradigm:** Hybrid (Web Frontend + Native Systems Backend)

## Frontend (UI & Timeline)
- **Language:** TypeScript
- **Framework:** React
- **Text Engine:** TipTap / ProseMirror (for binding text spans to video timestamps)
- **Canvas/Video:** HTML5 `<video>` synced with WebGL `<canvas>` for dynamic caption overlays
- **Styling:** Tailwind CSS or Vanilla CSS (Dark Mode optimized)

## Backend (Systems & Processing)
- **Language:** Rust
- **Media Engine:** Local FFmpeg & FFprobe (spawned asynchronously via Rust)
- **Audio DSP:** FFmpeg filters (e.g., `afftdn` for noise reduction, `acompressor` for leveling)
- **Local DB:** SQLite (via `rusqlite` for media library and project metadata)
- **Local AI:** ONNX Runtime (via Rust bindings for local background removal/segmentation)

## Cloud AI Intelligence (Abstracted Provider Layer)
*The backend implements a provider abstraction, allowing the user to provide API keys for either ecosystem.*

**Option A: Google Ecosystem**
- **Transcription/Clipping:** Gemini 3.0 Multimodal
- **B-Roll Generation:** Veo 3.1
- **Voice Cloning:** Gemini 3 Flash Native Audio

**Option B: OpenAI Ecosystem**
- **Transcription:** Whisper-v4
- **Editing Logic/Clipping:** GPT-5.4-standard / nano
- **B-Roll Generation:** Sora 2
- **Voice Cloning:** OpenAI Voice API