# Thai STT Engine Evaluation — Findings (2026-11-25)

**Question:** is there a locally runnable Thai STT engine that transcribes well
enough to replace `whisper small`, which garbles Thai in dogfood runs 2–3?
**Answer:** yes. **Typhoon ASR Realtime** (SCB 10X, 114M params) is clearly
better and roughly 15× faster than `whisper small` on this machine.

Machine: Intel i5-3470S (4 cores, AVX but no AVX2), 7 GB RAM, no GPU, Ubuntu.
Audio: 16 kHz mono WAV.

## Benchmark

- **Set:** FLEURS `th_th` test split (held-out, published references).
- **Sample:** 30 clips, one per distinct reference, 3–12 s, **253.6 s** total.
  The FLEURS Thai test TSV is female-only; see Limitations.
- **Metric:** corpus character error rate (CER) after NFC + lower-case +
  whitespace/punctuation removal + Thai-numeral folding. Thai has no word
  spaces, so CER is the standard ASR metric; the app's own word edits are
  judged separately.
- Hugging Face's main host is blocked here; models came from `hf-mirror.com`.

## Results

| Engine | CER | RTF | Wall / audio | Peak RSS | Model size |
|---|---:|---:|---:|---:|---:|
| **Typhoon ASR Realtime 114M** (ONNX) | **13.25 %** | **0.121** | 30.8 s / 253.6 s | 1.0 GB | 461 MB |
| Whisper small (faster-whisper int8) | 23.59 % | 1.882 | 477.3 s / 253.6 s | 811 MB | 462 MB |
| Typhoon Nemotron 0.6B streaming (int4)¹ | 11.83 % | 5.434 | 459.7 s / 84.6 s | 830 MB | 665 MB |
| Whisper large-v3 (faster-whisper int8)² | ~8.9 % | ~13.5 | 345.1 s / 25.5 s | 3.4 GB | 3.1 GB |

¹ 10 clips only (same subset as the directly comparable row below).
² 3 clips only; stopped because each 7–10 s clip took 1.5–2.4 minutes.

On the identical 10 clips: Typhoon **10.03 %**, Nemotron 0.6B **11.83 %**,
Whisper small **22.31 %**. Typhoon is better on **23 of 30** clips than
Whisper small (mean CER 13.9 % vs 23.5 %, median 11.5 % vs 24.1 %).

Typhoon is the only candidate that is both accurate and fast enough to use
interactively: **8.3× faster than real time** on this 2012-era CPU. Whisper
large-v3 is marginally more accurate but **13× slower than real time** — a
58 s clip would take ~13 minutes.

## Long-form check

Six FLEURS clips concatenated with 0.4 s pauses into a **51.3 s** file:
CER **8.54 %**, all six sentences present in order, no truncation. The model
handles long input fine.

## Timestamps (important for Verbal)

The model emits **phrase-level** chunks by default (5 chunks for a 10.6 s
clip); `return_timestamps="word"` gives the same chunks. `"char"` gives
sub-word tokens at 0.08 s granularity with real gaps. Example:

```
0.72-1.60 'ในทางตรงข้าม'
2.00-4.40 'สภาพอากาศอันหนาวเย็นและเต็มไปด้วยหิมะ'
...
char mode: 0.72-0.80 'ใน', 0.96-1.04 'ทาง', 1.28-1.36 'ตรง', 1.52-1.60 'ข้าม'
```

Word anchors can be derived by segmenting the text with Node's built-in
`Intl.Segmenter("th", {granularity:"word"})` and mapping the char chunks onto
the resulting words. Verified: the same sentence segments into 17 Thai words
correctly with Node 24 (the mapping itself is a design proposal, not yet
implemented). Boundaries are approximate (~0.1–0.3 s), which is adequate for
highlighting and word cuts but not frame-exact alignment.

## What the errors look like

Typhoon's remaining errors cluster in three places:

- **Numbers spelled out** — `1800` → `หนึ่งพันแปดร้อย`, `70` → `เจ็ดสิบ`.
  This is correct spoken Thai and inflates CER; the app may prefer to keep it.
- **English names and loanwords** — `danielle lantagne` → `แจเนี่ย`,
  `aerosmith` → `แอร์โรส`, `Atlantic` → `ALantic`.
- **Occasional tone/vowel slips** — `ชิมแปนซี` → `ชิมกันซี`,
  `ข่มขู่` → `ข่มหู`.

Whisper small's errors are different in kind: whole words are replaced with
unrelated Thai (`พระมหากษัตริย์` → `พร้อมหากระสับ`, `ไดโนเสาร์` →
`ดายน้องสาว`), so the text reads as gibberish. Typhoon's output is readable
and correct enough to edit.

Example (clip 10084130310330574566):

```
REF  พวกเขาเดินทางกลับปารีสในรถม้าซึ่งรายล้อมด้วยฝูงชนที่ตะคอกและข่มขู่พระมหากษัตริย์และพระราชินี
TY   พวกเขาเดินทางกลับปารีสไปในรถม้าซึ่งรายล้อมด้วยฝูงชนที่ตะคอกและข่มหูพระมหากษัตริย์และพระราชินี
WS   พวกเขาเดินทางกลับบ้าเรียดไปในรถมา ซึ่งรายร้องด้วยฝุ่งชนที่ตักของและขมหูพร้อมหากระสับและพาราชินี
```

## Recommendation

**Adopt Typhoon ASR Realtime as the local Thai engine.** Keep Whisper for
other languages and as a fallback. The model is CC-BY-4.0, 114M params,
461 MB, and runs on CPU with ~1 GB RAM.

Integration is a separate decision; the options and costs are below.
Nothing in this evaluation changed the repository's runtime.

## Integration options

| Option | Shape | Cost / risk |
|---|---|---|
| **A. `onnxruntime-node` + TS port** (recommended) | Port NeMo mel frontend and greedy RNNT decode into `packages/ai`; model downloaded to `~/.local/share/verbal/models`. | No new language runtime. Native Node module needs bundler externalisation (same class as FFmpeg subprocess). Medium effort; pure-function tests for mel/decode. |
| **B. Python sidecar** | Ship `pythaiasr` + onnxruntime, invoke a script with an argv array like FFmpeg. | Fastest to wire. Adds Python 3.12 + ~400 MB deps to setup; breaks the Node-only runtime preference. |
| **C. Cloud Thai STT** | Google Chirp 3 / ElevenLabs Scribe behind the existing ASR provider. | Likely best accuracy; paid, needs a key, audio leaves the machine. Architecture allows cloud for transcription. |
| **D. Keep Whisper only** | No change. | Rejected: this is the failure the evaluation was meant to fix. |

For A/B the provider contract needs: 16 kHz WAV in, text out, word spans
derived from char chunks + `Intl.Segmenter`, and an explicit "model missing"
state with a download step. Model acquisition and hash verification are new
setup surface and belong in `repository_contracts_20261122`.

## Limitations

- FLEURS is **read speech** and the test TSV is **female-only**. The original
  dogfood clip (Thai ad with music) is no longer available, so noisy,
  multi-speaker, music-bed audio was not measured. Expect worse real-world
  numbers.
- CER penalises spelled-out numbers; Typhoon's true word accuracy is better
  than 13.3 % suggests. No Thai word-level WER was computed.
- Thai fine-tuned Whisper checkpoints (`biodatlab/whisper-th-*`,
  `liqi03/whisper-large-v3-Thai`) were not run: they need torch/transformers,
  and the Thai-specialised 114M/0.6B ONNX models already bracket the question.
- No cloud engine was tested (no key, paid calls need separate approval).
- Absolute RTF is specific to this GPU-less AVX-only machine; the relative
  ordering should hold on modern CPUs.
