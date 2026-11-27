# Plan: Local Safety Boundaries

**Status:** NOT STARTED
**Created:** 2026-11-22
**Focus:** Protect the local API and its filesystem and subprocess boundaries.

**Check command:** `npm run check` and `npm run e2e`.
**Dependencies:** None.

---

## Phase 1: Loopback and request contracts

### Red

- [ ] Add failing Host and Origin tests before changing request handling.
      Files: `apps/web/server/http.test.ts`, `apps/web/server/local-request.test.ts` (new).
      Assert rejection occurs before provider and filesystem calls.
- [ ] Add a failing built-server smoke test for loopback defaults and hostile browser requests.
      File: `tools/e2e/local-boundary.mjs` (new).
      Test development, start, and standalone commands.

**Targeted Red command:** `npx vitest run apps/web/server/http.test.ts apps/web/server/local-request.test.ts`.

### Green

- [ ] Define the request schema and local-access contract before wiring routes.
      Files: `apps/web/server/local-request.ts` (new), `package.json`, `package-lock.json`.
      Add Zod through the repository package conventions.
- [ ] Apply the boundary to every API route and pin loopback starts.
      Files: `apps/web/pages/api/**`, `apps/web/vite.config.ts`, `apps/web/package.json`.
      Keep handlers thin.

### Verification

- [ ] Run the targeted tests and the built-server smoke test.
- [ ] Run `npm run check`; record exact results and listener addresses.
- [ ] Commit the phase and record its verification evidence.

---

## Phase 2: Paths, asset identifiers, and schemas

### Red

- [ ] Add failing traversal, null-byte, symlink, and missing-parent tests.
      Files: `packages/core/src/paths.test.ts`, `packages/core/src/media-path.test.ts`,
      `packages/compose/src/assets.test.ts`, `packages/storyboard/src/parse.test.ts`.
      Include one valid external reference and a project under a symlinked parent.
- [ ] Add failing music-path and geometry tests before changing export validation.
      Files: `apps/web/server/storyboard-api.test.ts`, `packages/compose/src/brand.test.ts`.
      Prove rejection occurs before the runner call.

**Targeted Red command:** `npx vitest run packages/core/src/paths.test.ts packages/core/src/media-path.test.ts packages/compose/src/assets.test.ts packages/storyboard/src/parse.test.ts apps/web/server/storyboard-api.test.ts packages/compose/src/brand.test.ts`.

### Green

- [ ] Define the shared schemas and filesystem containment adapter.
      Files: `packages/core/src/paths.ts`, `packages/core/src/media-path.ts`,
      `packages/core/src/project.ts`, `apps/web/server/validation.ts`.
      Preserve supported document parsing behavior.
- [ ] Validate asset identifiers and resolve music and generated assets through that adapter.
      Files: `packages/storyboard/src/parse.ts`, `packages/compose/src/assets.ts`,
      `packages/compose/src/brand.ts`, `apps/web/server/storyboard-api.ts`.
- [ ] Validate renderer manifests and bounded geometry with Zod.
      Files: `packages/compose/src/worker.ts`, `packages/compose/src/cache.ts`,
      `apps/web/server/storyboard-api.ts`.

### Verification

- [ ] Run the targeted tests against real temporary symlinks and injected runners.
- [ ] Run `npm run check`; verify ordinary Unicode and spaced paths still work.
- [ ] Commit the phase and record the path policy.

---

## Phase 3: Filtergraph serialization and child environment

### Red

- [ ] Add failing escaper and concat newline tests.
      Files: `packages/media/src/filtergraph.test.ts` (new),
      `packages/compose/src/composite.test.ts`, `packages/compose/src/assemble.test.ts`.
- [ ] Add a failing child-process environment test using sentinel secrets.
      Files: `packages/compose/src/worker.node.test.ts`,
      `apps/web/server/remotion-renderer.test.ts` (new).
      Do not read or print real credentials.

**Targeted Red command:** `npx vitest run packages/media/src/filtergraph.test.ts packages/compose/src/composite.test.ts packages/compose/src/assemble.test.ts packages/compose/src/worker.node.test.ts apps/web/server/remotion-renderer.test.ts`.

### Green

- [ ] Implement the shared escaper and typed filter validation.
      Files: `packages/media/src/filtergraph.ts` (new), package subpath exports,
      `packages/compose/src/composite.ts`, `packages/compose/src/assemble.ts`.
      Update import mappings only when a new subpath requires them.
- [ ] Pass an explicit environment through the renderer adapter.
      Files: `packages/compose/src/worker.ts`, `apps/web/server/remotion-renderer.ts`.

### Verification

- [ ] Run the targeted tests and one local FFmpeg punctuation-path fixture.
- [ ] Run `npm run check` and `npm run e2e` through the shared heavy runner.
- [ ] Review the boundaries independently before marking the track complete.
- [ ] Commit evidence; update the registry and metadata after acceptance.
