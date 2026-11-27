# Spec: Typhoon Windowed Inference

Source: Astra backend review H07 at `c6dc3f4`.

## Problem

Typhoon reads the whole WAV and computes every mel frame in one synchronous loop (`packages/ai/src/typhoon.ts:184-186`; `packages/ai/src/typhoon-engine.ts:360-375`; `packages/ai/src/typhoon-features.ts:237-275,297-301`). One hour of audio needs about 230 MB for `logMel` alone. The loop blocks the event loop, so the API and cancel do not respond. Abort cannot interrupt it.

## Requirements

1. FR1. Audio is processed in bounded windows (default 30 s with a 1 s overlap) so peak memory does not grow with media length.
2. FR2. Feature extraction and inference run in a `worker_threads` worker. The main thread stays responsive. Abort terminates the worker.
3. FR3. Window outputs merge into one word list with absolute times and no duplicated word in the overlap.
4. FR4. Progress is reported per window.

## Acceptance

- A test shows the event loop answers a timer during a long synthetic job.
- Output of a 90 s fixture equals the output of the old one-shot path within one word of tolerance at the window seams (compare token text and times within 0.1 s).
- Abort stops the worker within 1 s.
- Peak RSS for a 30 min synthetic clip stays under 600 MB (measure through the heavy lock; record it).
