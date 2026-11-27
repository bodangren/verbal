# Plan: Export Safety (backend review 2026-11-27)

**Status:** NOT STARTED
**Created:** 2026-11-27
**Focus:** Never delete the source video, isolate concurrent exports, contain storyboard paths, bound upload size.

**Check command:** targeted `npx vitest run` per task; then `npm run check` and `npm run e2e` through the heavy lock (orchestrator).
**Relation to older tracks:** Replaces and rolls up (the old tracks are archived). Narrows `save_export_integrity_20261122` Phase 2 (no-clobber, source alias, isolated work) and `local_safety_20261122` Phase 2 (path containment). Those phases stay open for the wider contract; this track closes the review findings first.

---

## Worker rules (every task)

- Red first: write the failing test, run it, see it fail for the stated reason, then fix.
- Run only the targeted `npx vitest run <files>` through the heavy lock:
  `HEAVY_PRIORITY=p2 HEAVY_MIN_AVAIL_MB=1500 bash /home/daniebo/Desktop/advantage-pr/scripts/jobs/heavy-run.sh -c '<command>'`.
  The orchestrator runs `npm run check` and `npm run e2e`.
- Touch only the files named in the task. No commits. No edits under `measure/`.
- No test file under `apps/web/pages/` (`pages-hygiene.test.ts` guards this).
- TypeScript `strict`, ESM, argv arrays for subprocesses, no `shell: true`.
- Never run `opencode` or `openchamber`.
- Write prose (comments, errors, copy) in short active sentences.

---

## Phase 1: Implement the findings

Each task is one worker: Red test, Green fix, orchestrator review, orchestrator commit.

- [x] **S1** (B01 FR1+FR2): Reject source-alias destinations and publish export output atomically. 1867d12
      Evidence: 89 media and route tests green. First pass was rejected in review (symlinked destination file passed; the `.partial` suffix broke WebM, MKV and audio); the rework fixed both.
      Wave 1. Worker: `openai/gpt-6-luna`.
      Files: `apps/web/pages/api/export.ts`, `packages/media/src/export.ts`, `packages/media/src/export.test.ts`, `apps/web/pages/api/export.test.ts` is NOT allowed (pages hygiene): put route tests in `apps/web/server/export-route.test.ts` (new).
      Red: Test 1: destination equals source path -> 400, no job created. Test 2: destination is a symlink to the source -> 400. Test 3: runner throws -> the old destination file still has its old bytes and no `*.partial` file remains. Test 4: runner succeeds -> destination holds the new bytes via rename.
      Green: Add `resolveExportDestination(source, destination)` (pure helper plus injected `realpath`) in `packages/media`. Make `runExport` write `<dest>.<jobid>.partial`, rename on success, unlink only the partial on failure. Wire the route to answer 400 with `outputPath must not be the source video`.
      Check: `npx vitest run packages/media apps/web/server/export-route.test.ts`
- [x] **S2** (M03 FR5): Bound request bodies and stream take uploads. 5891ac2
      Evidence: `http.test.ts` and `take-api.test.ts` green. Gap: vinext pre-parses JSON bodies, so the limit applies only when the stream is read; `failure()` in `api-errors.ts` does not map `PayloadTooLargeError` to 413 (task S2b).
      Wave 1. Worker: `claude-agent/haiku`.
      Files: `apps/web/server/http.ts`, `apps/web/server/http.test.ts`, `apps/web/pages/api/takes.ts`, `apps/web/server/take-api.ts`, `apps/web/server/take-api.test.ts`.
      Red: Test 1: `readJsonBody` with a body above the limit rejects with a typed error that maps to 413 before it buffers the whole body. Test 2: take upload with a declared size above 512 MiB answers 413 without decoding. Test 3: a valid upload lands in a temporary file, not a single in-memory string.
      Green: Count bytes in the chunk loop and destroy the request at the limit. Check `content-length` first. Write the decoded recording through a stream to a private temporary file, then move it.
      Check: `npx vitest run apps/web/server/http.test.ts apps/web/server/take-api.test.ts`
- [x] **S2b** (M03 follow-up from S2): Map `PayloadTooLargeError` to HTTP 413 in the shared error handler. 5ce3ed4
      Evidence: `api-errors.test.ts` green; Red showed 500 for both errors.
      Wave 2. Worker: `claude-agent/haiku`.
      Files: `apps/web/server/api-errors.ts`, `apps/web/server/api-errors.test.ts`.
      Red: `failure(new PayloadTooLargeError(10))` returns status 413 with the message; today it returns 500.
      Green: add the `instanceof` branch.
      Check: `npx vitest run apps/web/server/api-errors.test.ts`
- [x] **S3** (H05 FR3): Give each storyboard export a private work directory. 8291d82
      Evidence: 142 storyboard and compose tests green; Red showed both jobs writing to `cache/assembly`. Gap: a crashed process leaves its job directory behind; no sweep yet.
      Wave 2. Worker: `claude-agent/haiku`.
      Files: `apps/web/server/storyboard-api.ts`, `packages/compose/src/render-step.ts`, their tests. Depends on E3 (same `render-step.ts`).
      Red: Test: two exports of one project with different scenes and a delayed runner write to different directories, and neither reads the other's `concat.txt`. Test: the directory is gone after success and after failure.
      Green: Create `cache/assembly/<jobId>/`, pass it as the work directory, remove it in a `finally`.
      Check: `npx vitest run apps/web/server/storyboard-api.test.ts packages/compose`
- [x] **S4** (H06 FR4): Validate generated asset ids and contain asset and music paths. 5859c1f
      Evidence: 228 tests green. Asset id is 64 lowercase hex (`packages/compose/src/assets.ts:48`). Brand music is project-relative per the brand type; absolute paths and `..` are rejected. Gap: realpath and FFmpeg read are not atomic.
      Wave 2. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Files: `packages/storyboard/src/parse.ts`, `packages/compose/src/brand.ts`, `apps/web/server/storyboard-api.ts`, `packages/core/src/paths.ts` (add helper only if none exists), tests. Depends on S3 (same `storyboard-api.ts`).
      Red: Tests: asset id `../x` and `a/b` rejected; id not 64 hex rejected; music path `../../etc/passwd`, a null byte, and a symlink out of the project all rejected; a normal Unicode path with spaces accepted.
      Green: Add `asset id` regex in the parser. Route asset and music files through `resolveInsideProject` (it exists in `apps/web/pages/api/export.ts` usage; reuse it, do not duplicate).
      Check: `npx vitest run packages/storyboard packages/compose apps/web/server/storyboard-api.test.ts`

## Phase 2: Rolled up from archived tracks

These phases came from older tracks that overlapped this one. The archived plan holds the full Red and Green detail. Read it first, then re-check each claim against the current code, because the code moved on 2026-11-27.

- [ ] **S5** (from `local_safety_20261122` Phase 1): Loopback-only server and request contract.
      Wave 5. Worker: `openai/gpt-6-luna`.
      Detail: `measure/archive/superseded_backend_review_20261127_local_safety_20261122/plan.md`.
      Scope: Host and Origin tests; built-server smoke test for loopback defaults and hostile browser requests; one request-schema layer (Zod) applied to every API route; the server listens on 127.0.0.1 only.
- [ ] **S6** (from `local_safety_20261122` Phase 2 (rest)): Shared schemas, renderer manifest validation, bounded geometry.
      Wave 5. Worker: `opencode-go/muse-spark-1.3-contributor`.
      Detail: `measure/archive/superseded_backend_review_20261127_local_safety_20261122/plan.md`.
      Scope: Validate renderer manifests and bounded geometry with Zod; real temporary-symlink tests. S4 already covers asset ids and music paths.
- [ ] **S7** (from `local_safety_20261122` Phase 3): Filtergraph escaper and explicit child environment.
      Wave 5. Worker: `deepseek/deepseek-v4-pro`.
      Detail: `measure/archive/superseded_backend_review_20261127_local_safety_20261122/plan.md`.
      Scope: Shared FFmpeg filtergraph escaper and typed filter validation; concat-list newline tests; the renderer child gets an explicit environment (sentinel-secret test); one local FFmpeg punctuation-path fixture.
- [ ] **S8** (from `save_export_integrity_20261122` Phase 2 (rest)): Provenance publication and explicit replacement consent.
      Wave 5. Worker: `openai/gpt-6-luna`.
      Detail: `measure/archive/superseded_backend_review_20261127_save_export_integrity_20261122/plan.md`.
      Scope: Write provenance next to a verified output; the UI asks before it replaces an existing file; operation state is visible. S1 and S3 already cover temporary output, alias rejection and isolated work.

## Phase 3: Verify

- [ ] Orchestrator reviews every diff and sends weak work back.
- [ ] Independent acceptance review by `openai/gpt-6.2-sol`, report-only, before the track closes.
- [ ] `npm run check` green through the heavy lock.
- [ ] `npm run e2e` PASS through the heavy lock.
- [ ] Commit each task; record the 7-character SHA on its line.
