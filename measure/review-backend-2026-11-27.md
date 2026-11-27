# Backend review, 2026-11-27

**Reviewer:** GPT-6.2 Astra (high effort), read-only, on `master` at `c6dc3f4`.
**Checked by the orchestrator in code:** B01, H01, H02, H03, M06. The other items carry the reviewer's file and line proof and are not yet re-read.

| ID | Severity | Finding | Track and task |
|---|---|---|---|
| B01 | Blocker | A failed export can delete the source video (`api/export.ts`, `media/export.ts`). | export_safety S1 |
| H01 | High | Plain export and freeze ignore reorder and inserted silence. | export_fidelity E2 |
| H02 | High | Cleanup treats distinct Thai words as stutters (`/[^a-z]/`). | asr_hardening A1 |
| H03 | High | Slide and asset composites replay speech from 0 s. | export_fidelity E3 |
| H04 | High | Cancel changes job status but does not stop work. | job_integrity J2 |
| H05 | High | Concurrent storyboard exports share work files. | export_safety S3 |
| H06 | High | Asset ids and brand music paths are not contained. | export_safety S4 |
| H07 | High | Typhoon blocks the process and holds all features in memory. | typhoon_windowed T1, T2 |
| H08 | High | Cloud transcription uploads the whole video. | asr_hardening A5 |
| H09 | High | A new media file leaves the old transcript active. | job_integrity J3 |
| H10 | High | Storyboard export silently omits valid scene kinds. | export_fidelity E5 |
| M01 | Medium | Overlapping words replay footage. | export_fidelity E1 |
| M02 | Medium | Audio-only export still needs video. | export_fidelity E4 |
| M03 | Medium | Upload limits apply after memory allocation. | export_safety S2 |
| M04 | Medium | Concurrent saves can persist an older job state. | job_integrity J1 |
| M05 | Medium | Local ASR writes scratch files beside the source. | asr_hardening A3 |
| M06 | Medium | Typhoon overrides an explicit non-Thai language. | asr_hardening A2 |
| M07 | Medium | Slow connections cannot finish the model download. | asr_hardening A4 |

**Found sound:** atomic JSON writes, the argv media runner, waveform option limits, the `/api/fs/list` picker scope, and the model installer's size and SHA-256 check.

**Rolled up from archived tracks** (`measure/archive/superseded_backend_review_20261127_*`): loopback and request contract, shared schemas, filtergraph escaper (Local Safety); versioned edit contract, shared playback timeline, stream normalisation (Edit Timeline Integrity); save coordinator, provenance publication, export reuse (Save and Export Integrity); slow work in jobs and SSE events (Job Lifecycle).
