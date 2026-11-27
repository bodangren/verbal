# Spec: Export Safety

Source: Astra backend review of 2026-11-27 at `c6dc3f4`. Every finding was read in code.

## Problem

- **B01 (Blocker).** `POST /api/export` accepts any absolute `outputPath`. It never compares the path with the source media path (`apps/web/pages/api/export.ts:31-40`). FFmpeg gets `-y`. When FFmpeg fails, `runExport` unlinks the destination (`packages/media/src/export.ts:263-270`). With destination equal to source, a failed export deletes the user's source video.
- **H05.** Two exports of one project share `cache/assembly`, numbered segment names, and `concat.txt` (`apps/web/server/storyboard-api.ts:334-345,379-382`; `packages/compose/src/render-step.ts:89-94`). Parallel jobs can mix footage.
- **H06.** Generated asset ids need only be text before they join a path (`packages/storyboard/src/parse.ts:55-57`; `apps/web/server/storyboard-api.ts:287-295`). Brand music reaches FFmpeg unchanged (`packages/compose/src/brand.ts:136-138,151-156`), so a relative path resolves against the server directory.
- **M03.** The JSON reader collects chunks without counting bytes (`apps/web/server/http.ts:15-31`). The take upload decodes the whole base64 string before it checks the 512 MiB limit (`apps/web/pages/api/takes.ts:38-55`, `apps/web/server/take-api.ts:84-92`).

## Requirements

1. FR1. An export destination that is the same file as any project media path (compare resolved real paths, including symlinks and case where the file system folds case) is rejected with HTTP 400 and a clear message before any job starts.
2. FR2. An export writes to a unique temporary sibling file. It renames that file to the destination only after FFmpeg exits 0. On failure it removes only the temporary file. An existing destination file stays untouched on every failure path.
3. FR3. Each storyboard export job uses a private work directory under the project cache, named by job id. The job removes the directory when FFmpeg ends, on success and on failure.
4. FR4. Generated asset ids must match the stored SHA-256 hex format. Asset files and brand music resolve through one containment helper that rejects any path outside the canonical project directory (null bytes, `..`, symlink escape).
5. FR5. The JSON body reader stops at a byte limit and answers HTTP 413. The take upload checks the declared size before decoding and streams bytes to a private temporary file.

## Acceptance

- A test per requirement fails on `c6dc3f4` and passes after the fix.
- A real failed export onto the source file leaves the source file byte-identical (hash recorded).
- Ordinary Unicode and spaced paths still export.
