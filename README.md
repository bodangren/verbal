# Verbal

Verbal is a next-generation desktop media editor designed primarily for Linux, bringing the intuitive "document-style" video and audio editing paradigm to local environments. By treating media editing like word processing, Verbal aims to make video production accessible, fast, and frictionless.

## Key Features

- **Frictionless Editing:** Edit video by simply deleting or moving text in the generated transcript.
- **Unified AI Engine:** Seamlessly toggle between Google (Vertex AI/Gemini) and OpenAI ecosystems for all AI intelligence features, preventing vendor lock-in.
- **Privacy and Cost Efficiency:** Hybrid architecture keeps resource-heavy media processing (rendering, DSP audio cleanup, background removal) local, relying on API calls only for core AI intelligence.

## Technology Stack

- **Frontend:** React, TypeScript, Tailwind CSS, TipTap / ProseMirror
- **Backend:** Tauri v2, Rust
- **Media Engine:** Local FFmpeg & FFprobe
- **AI Integrations:** Google Vertex AI (Gemini 3.0, Veo 3.1, Gemini Native Audio) and OpenAI (Whisper-v4, GPT-5.4, Sora 2, Voice API)

## Development

See the `conductor/` directory for project management, technical specifications, and development workflows.