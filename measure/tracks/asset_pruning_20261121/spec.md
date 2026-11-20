# Specification: Asset Pruning

## Overview

`assets/generated/` grows monotonically: content addressing deduplicates identical bytes, but every distinct generation stays forever. The open tech-debt entry asks for a retain/prune policy. This track adds a pure retention planner, an endpoint that reports the plan before anything is deleted, and an explicit action in the page.

## Goals

1. A pure planner that decides which stored assets are referenced and which are prunable.
2. A destructive step that only runs after the plan is reported and confirmed.
3. User-supplied assets are never deleted.

## Non-Goals

- Automatic background pruning: deletion is always an explicit decision.
- Pruning rendered previews or exports (other directories, other owners).
- Deduplication (already handled by content addressing).

## Functional Requirements

### FR1: Planner
- `planAssetPrune({ storyboard, assets, now, minAgeSeconds? })` returns `{ keep, prune, retained }`.
- An asset referenced by any scene's `assetId` is kept with reason `referenced`.
- A `user` asset is always kept with reason `user`.
- An unreferenced `generated` asset younger than `minAgeSeconds` (default 24h) is `retained` with reason `recent`.
- An unreferenced `generated` asset at or past the threshold is `prune`.
- Output order follows the input asset order, so a plan is stable and diffable.

### FR2: Endpoint
- `POST /api/storyboard/prune` returns the plan and deletes nothing.
- `POST /api/storyboard/prune` with `{ apply: true }` deletes exactly the planned files and returns what it deleted.
- A project without a storyboard is `404`; a relative root is `400`; another method is `405`.

### FR3: Page
- A *Prune assets* action reports the plan first ("N prunable"), and only a second, explicit confirmation deletes.
- The result reports how many files were removed.

## Acceptance Criteria

- [ ] Unit tests cover referenced, user, recent, and prunable assets and the ordering.
- [ ] Route tests prove that the default call deletes nothing and `apply` deletes exactly the planned files.
- [ ] `npm run check` passes and the walkthrough still passes.

## Dependencies

- `AssetStore` records and `pathFor` (complete).
- Storyboard document with `assetId` scene fields (complete).

## Risks

- A storyboard that references an asset only through a draft the user has not saved would look unreferenced; the age threshold plus the report-before-delete step is what prevents losing it.
