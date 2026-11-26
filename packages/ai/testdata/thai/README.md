# Thai test audio

`common-voice-th.wav` — a 5.0 s, 16 kHz mono Common Voice Thai recording.

- Source: the PyThaiASR test fixtures
  (https://github.com/PyThaiNLP/pythaiasr/blob/main/tests/common_voice_th_25686161.wav),
  originally from Mozilla Common Voice.
- Licence: Common Voice audio is CC0 (public domain).
- Used by `typhoon.integration.test.ts`, which skips unless the Typhoon model
  is installed. The expected transcript is the reference Python output:
  `มันเป็นเรื่องที่ดี ที่การเดินทางย้อนเวลาไม่ได้มีอยู่จริง`
