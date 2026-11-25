# Verbal

Local-first transcript-driven video editing. See `DESIGN.md` for the product and `AGENTS.md` for development rules.

## Transcription setup

Verbal uses local whisper.cpp by default. Audio stays on this machine.

1. Build whisper.cpp: `git clone https://github.com/ggml-org/whisper.cpp`, then `cmake -B build`, then `cmake --build build --target whisper-cli`.
2. Download a ggml model, for example `ggml-small.bin`, from the whisper.cpp release page.
3. Put or symlink `whisper-cli` into `~/.local/share/verbal/bin/`.
4. Put or symlink the model into `~/.local/share/verbal/models/`.

Cloud mode sends audio off the machine. Set it only when you choose that.

- `VERBAL_ASR=cloud` selects the cloud provider. `VERBAL_ASR=local` forces local.
- `VERBAL_WHISPER_BIN` and `VERBAL_WHISPER_MODEL` override the discovered paths.
- `VERBAL_ASR_LANGUAGE` sets the whisper language. The default is `auto`.
- `OPENAI_API_KEY` is used only when no local engine is found.
