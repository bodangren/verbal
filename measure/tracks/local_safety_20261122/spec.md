# Specification: Local Safety Boundaries

## Problem

The local API can browse files, write documents, capture media, and start paid operations.
Its current trust boundary depends on server defaults.
Asset identifiers, music paths, and filtergraph fields have separate validation gaps.
See [F07–F09 and the architecture checks](../../review-2026-11-22.md).

## Goals

1. Enforce loopback access for development, production, and standalone starts.
2. Validate browser request origins and hosts before API work.
3. Separate explicit external files from project-contained assets.
4. Validate all subprocess inputs at shared boundaries.
5. Remove provider credentials from the Remotion environment.

## Non-Goals

- Accounts, remote access, telemetry, cloud storage, or distribution.
- Restricting Daniel's explicit source or destination choice to his home folder.
- Replacing FFmpeg or the provider abstraction.
- Editing `measure/automation-supervisor.py`.

## Functional Requirements

### FR1: Local HTTP boundary

- Supported start commands bind only to loopback by default.
- Accept `127.0.0.1`, `localhost`, and `[::1]` with the configured port.
- Reject an unexpected Host before reading or writing project data.
- Reject a present Origin unless it matches an allowed local application origin.
- Reject cross-site browser requests, including requests with an opaque Origin.
- Keep same-origin browser requests and originless local CLI requests usable.
- Document that a local process already has the owner's filesystem privileges.

### FR2: Path and document schemas

- Use Zod for changed HTTP, document, renderer-manifest, and subprocess input boundaries.
- Preserve supported document versions and explicit external-media references.
- Accept only lowercase SHA-256 hexadecimal asset identifiers.
- Reject null bytes, traversal, and malformed asset identifiers before any subprocess.
- Prove real-path containment for embedded assets and their existing parent directories.
- Resolve brand music relative to the selected project.
- Reject embedded symlinks that escape the project.
- Validate destination parents without requiring the destination file to exist.
- Keep temporary work inside the selected job directory.

### FR3: FFmpeg serialization

- Put paths in argv slots, not filtergraph text.
- Use one dedicated filtergraph escaper for textual values that enter a filtergraph.
- Validate numeric values as finite values within documented bounds.
- Require integer dimensions between 2 and 7680, with even video dimensions.
- Require a frame rate greater than zero and no greater than 120.
- Validate chroma colors against a restricted color grammar.
- Reject newline and carriage-return characters in concat-list filenames.
- Preserve ordinary spaces, apostrophes, Unicode, and punctuation in valid paths.

### FR4: Renderer environment

- Construct an explicit renderer environment through the process adapter.
- Keep PATH, HOME, temporary-directory, locale, and required Chrome settings.
- Exclude provider tokens and unrelated application secrets.
- Keep subprocess invocation shell-free.

## Acceptance Criteria

- A built-server test rejects hostile Host and Origin values without filesystem or provider calls.
- Development and production smoke checks show only loopback listeners.
- Valid local browser and CLI requests still create and open a project.
- Traversal identifiers and escaping symlinks fail before FFmpeg runs.
- An explicit external reference still resolves outside the project.
- Brand music resolves identically regardless of server working directory.
- Escaper tests cover apostrophes, backslashes, colons, commas, brackets, and semicolons.
- Geometry tests reject infinity, fractional dimensions, and oversized values.
- A child fixture proves provider credentials are absent from the renderer environment.
- `npm run check` and the offline browser walkthrough pass.

## Dependencies

None. This track supplies adapters for later tracks.

## Risks

- Proxy-style Host handling can accidentally permit DNS rebinding.
- Real-path checks need a clear policy for missing output files.
- Filesystem races remain possible between validation and use.
  Prefer safe open flags where available.
- Originless local scripts remain privileged by design.

## Verification

Use fake providers and temporary directories.
Use the shared heavy runner for installation, build, and media gates.
Never call a paid API.
