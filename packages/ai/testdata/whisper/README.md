# Whisper CLI fixtures

Real output from `whisper-cli` (whisper.cpp commit 3e2e46a), model `ggml-small.bin`, captured 2026-11-24.

- `speech-words-th.json`: `-l auto -oj -ml 1 -sow` on 20 s of Thai and English speech. This is the form Verbal uses.
- `speech-segments-th.json`: the same audio with `-oj` only. One entry per sentence, too coarse to edit by word.
- `music-only.json`: a music intro. The only entry is the tag `[เสียงดนตรี]`, which is not speech.

`whisper-cli` reads audio only. It fails on an MP4 with `failed to read audio file`. Extract 16 kHz mono PCM WAV first:
`ffmpeg -i in.mp4 -vn -ar 16000 -ac 1 -c:a pcm_s16le out.wav`.
