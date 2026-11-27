# Spec: ASR Hardening

Source: Astra backend review of 2026-11-27 at `c6dc3f4`. H02 and M06 were re-read in code by the orchestrator.

## Problem

- **H02.** `normalise` in `packages/cleanup/src/detect.ts:37-40` is `toLowerCase().replace(/[^a-z]/g, "")`. Every Thai word becomes `""`. The stutter pass (`detect.ts:95-109`) sees consecutive Thai words as equal and proposes deleting all but the first.
- **M06.** `resolveAsr` returns `{mode:"typhoon", language:"th"}` as soon as the Typhoon model exists. It reads `VERBAL_ASR_LANGUAGE` only afterward (`apps/web/server/asr-resolve.ts:93-98,122-134`). An English user with Typhoon installed gets the Thai engine.
- **M05.** Whisper and Typhoon write a WAV and JSON beside the source (`packages/ai/src/local.ts:149-160,233-245`; `packages/ai/src/typhoon.ts:119-124`). Concurrent jobs share names. Cleanup leaves the JSON. A read-only media folder fails.
- **M07.** The 456 MB model download has a 60 s deadline over the whole body, and a timeout removes all progress (`tools/fetch-typhoon-model.mjs:28-31,109,133-144`).
- **H08.** The cloud provider reads the whole video into memory and uploads it (`packages/ai/src/openai.ts:88-107`). Only audio is needed.

## Requirements

1. FR1. `normalise` keeps Unicode letters and combining marks (`\p{L}\p{M}\p{N}`). Empty results never compare equal.
2. FR2. The resolver reads the requested language first. Typhoon is chosen only when the language is `th` or unset and the text engine allows Thai. An explicit non-Thai language picks whisper.
3. FR3. Each local ASR call creates a private temporary directory (`os.tmpdir()` based), writes there, and removes it in `finally`.
4. FR4. The model fetch uses an inactivity timeout (no bytes for 60 s), keeps a `.part` file, resumes with `Range`, and still verifies size and SHA-256 before it publishes.
5. FR5. The cloud provider extracts compressed audio locally (mono, 16 kHz, small bitrate), splits above the API size limit, and adds each chunk's offset to word times.

## Acceptance

- Tests for each requirement fail on `c6dc3f4`, pass after the fix.
- A Thai fixture with five different Thai words yields zero stutter proposals.
- A two-chunk cloud fixture returns words with correct absolute times.
