# Specification: Library UX

## Overview

Opening a project means typing an absolute path into a text field, and nothing shows what exists on disk. A creator with several takes has no way to see them, compare them, or pick one. This track adds a library: a scan of a parent folder, summarised, and opened with one click.

## Goals

1. A pure, injectable scanner that summarises the projects under a folder.
2. An endpoint that serves those summaries.
3. A library panel that lists projects and opens one.

## Non-Goals

- Deleting or renaming projects from the library.
- Thumbnails (needs media decoding; a later refinement).
- Recursive scanning of arbitrary depth: one level below the chosen folder, so a stray copy elsewhere is not silently discovered.
- Remembering the last folder across restarts.

## Functional Requirements

### FR1: Scanner
- `scanLibrary(folder, deps)` lists the directory's entries, treats each subdirectory as a project candidate, and returns a summary per readable `project.json`.
- A summary carries `root`, `name`, `hasMedia`, `transcriptWords` (kept words), `removedWords`, and `createdAt`.
- A subdirectory without `project.json`, or with an unreadable one, is skipped rather than failing the scan.
- A project whose transcript is missing or invalid reports zero words rather than failing the scan.
- Results are sorted newest first by `createdAt`, then by name, so the listing is stable.

### FR2: Endpoint
- `GET /api/projects/list?folder=<absolute>` returns `{ projects }`.
- A relative folder is `400`; another method is `405`; a missing folder is `400` with a clear message rather than an empty list.

### FR3: Page
- A *Library* panel lists the scanned projects with name, word count, and whether media is attached.
- Clicking *Open* on a row opens that project, reusing the existing open path.
- A folder field plus a *Scan* action drives the listing.

## Acceptance Criteria

- [ ] Scanner tests cover summaries, skips, invalid transcripts, and ordering.
- [ ] Route tests cover a listing, a relative folder, and a wrong method.
- [ ] The page lists and opens a project; the walkthrough opens one from the library.

## Dependencies

- `project.json` format and transcript model (complete).
- Project open/create API (complete).

## Risks

- Scanning reads every `project.json` under the folder; on a folder of thousands that is slow, so the endpoint stays one level deep and the page scans on demand rather than on load.
