# Plan: Thai STT Engine Evaluation

**Status:** COMPLETE — evaluation. Integration is a separate decision.
**Created:** 2026-11-25
**Focus:** Find out whether any locally runnable STT engine transcribes Thai well enough to replace the failing `whisper small` default.

**Check command:** evaluation harness in the session scratch directory; `npm run check` only when wiring a winner into `packages/ai`.
**Dependencies:** none (evaluation). Integration depends on `local_safety_20261122` only if a new subprocess/engine path is added.

**Origin:** Daniel, 2026-11-25 — "I don't think we will find a decent Thai STT engine but you should try." This authorises model downloads for the experiment. Paid/cloud calls remain out of scope without separate approval.

---

## Benchmark

- [x] Use FLEURS `th_th` test split (held out, published references) as the reference set; take a fixed sample of clips so runs are comparable.
      30 clips, 253.6 s, one per distinct reference; female-only (the test TSV is).
- [x] Normalise Thai text (strip punctuation/spaces, NFC) and score CER; keep raw hypotheses for eyeballing.
- [x] Record latency (RTF), peak RSS, and model size for each engine on this machine (4 cores, no GPU).

## Candidates

- [x] Baseline: Whisper `small` (current default) and `large-v3` via faster-whisper (int8) — same weights, CPU-friendly runtime.
      small: CER 23.59 %, RTF 1.88. large-v3: ~8.9 % on 3 clips, RTF ~13.5; stopped for time.
- [x] Typhoon ASR Realtime 114M (SCB 10X, Thai-only, FastConformer transducer, ONNX via PyThaiASR) — the primary Thai-specific candidate.
      CER 13.25 %, RTF 0.121, 1 GB RSS. Winner.
- [x] Typhoon Nemotron 0.6B streaming (int4 ONNX) as a second Thai-specific candidate.
      CER 11.83 % on 10 clips, RTF 5.43; worse than the 114M model on the same clips and 45× slower.
- [ ] A Thai fine-tuned Whisper (`biodatlab/whisper-th-medium-combined` or `-large-combined`).
      Skipped: needs torch/transformers; the Thai-specialised ONNX models already answer the question.
- [ ] Qwen3-ASR 0.6B Thai fine-tune.
      Not needed after the Typhoon result.

## Deliverable

- [x] `findings.md`: CER table, speed table, sample transcripts, and a recommendation (adopt / keep as opt-in / drop).
- [x] If an engine wins: propose the integration into `packages/ai` (provider boundary, model acquisition, 16 kHz WAV path) as a follow-up phase here, not in this evaluation.
      Findings lists four options; the choice is Daniel's.
- [x] Update `measure/tracks.md`, `measure/tech-debt.md` (stale local-whisper note), and the dogfood open item with the result.
