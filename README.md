# Verbal

Local-first transcript-driven video editing. See `DESIGN.md` for the product and `AGENTS.md` for development rules.

## Transcription setup

Verbal transcribes on this machine. Audio never leaves it in local mode.

### Thai (recommended): Typhoon ASR Realtime

1. Run `npm run fetch:typhoon`. It downloads the 114M-parameter ONNX model
   (about 461 MB) to `~/.local/share/verbal/models/typhoon-asr-realtime/` and
   verifies its size and SHA-256.
2. Restart the app. Ingest reports `Local (Typhoon ASR, Thai)`.

If `huggingface.co` is unreachable, set
`VERBAL_HF_MIRROR=https://hf-mirror.com` for the fetch. `VERBAL_TYPHOON_MODEL`
points at a different model directory (it must contain `encoder.onnx`,
`decoder.onnx`, and `vocab.json`).

The model is CC-BY-4.0 by SCB 10X (Typhoon). See
`packages/ai/THIRD_PARTY_NOTICES.md`.

### Other languages / fallback: whisper.cpp

1. Build whisper.cpp: `git clone https://github.com/ggml-org/whisper.cpp`, then `cmake -B build`, then `cmake --build build --target whisper-cli`.
2. Download a ggml model, for example `ggml-small.bin`, from the whisper.cpp release page.
3. Put or symlink `whisper-cli` into `~/.local/share/verbal/bin/`.
4. Put or symlink the model into `~/.local/share/verbal/models/`.

Cloud mode sends audio off the machine. Set it only when you choose that.

- `VERBAL_ASR=cloud` selects the cloud provider. `VERBAL_ASR=local` forces local.
- A complete Typhoon model is preferred; whisper is used when it is absent.
- `VERBAL_WHISPER_BIN` and `VERBAL_WHISPER_MODEL` override the discovered paths.
- `VERBAL_ASR_LANGUAGE` sets the whisper language. The default is `auto`.
- `OPENAI_API_KEY` is used only when no local engine is found.
