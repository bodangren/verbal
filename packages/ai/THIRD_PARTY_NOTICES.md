# Third-party notices

## Typhoon ASR Realtime

- **Work:** Typhoon ASR Realtime (114M FastConformer transducer, Thai)
- **Author:** SCB 10X / OpenTyphoon
- **Source:** https://huggingface.co/wannaphong/typhoon-asr-realtime-onnx
  (ONNX export of https://huggingface.co/typhoon-ai/typhoon-asr-realtime)
- **Licence:** Creative Commons Attribution 4.0 International (CC-BY-4.0)
  https://creativecommons.org/licenses/by/4.0/
- **Used by:** the local Thai speech engine (`packages/ai/src/typhoon-*`), fetched
  with `npm run fetch:typhoon`. The model is not distributed with Verbal.

The inference code in this repository is an independent TypeScript port of the
reference Python preprocessing and greedy decoding in the `pythaiasr` project
(Apache-2.0), which in turn follows NVIDIA NeMo's FastConformer export.
