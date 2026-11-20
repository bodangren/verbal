# AGENTS.md

## Measure Workflow

All development runs through the **Measure** spec-driven development framework exclusively. At the start of every session:

1. Load the `measure` skill
2. Read `measure/index.md` to understand the project context
3. Follow the workflow defined in `measure/workflow.md`

Key reference files:
- `measure/tracks.md` — Active work registry
- `measure/tracks/<track_id>/plan.md` — Task checklist
- `measure/product.md` — Product vision
- `measure/tech-stack.md` — Technology choices
- `measure/lessons-learned.md` — Project memory
- `measure/tech-debt.md` — Known shortcuts

Never start significant work without an active track. Always update `measure/tracks.md` and the current track's `plan.md` before and after work.

## Architectural Mandates

> The GTK4 + GStreamer + Go implementation was retired on 2026-11-20. Rationale and rejected alternatives are recorded in `measure/tech-stack.md`.

- **Language:** TypeScript, `strict`, ESM only. Go, CGo, GTK, and GStreamer must not appear in new code.
- **Runtime:** Node.js 24.
- **Meta-framework:** vinext with the **Pages Router**, client-first. Do not use the App Router or React Server Components — vinext's RSC development environment can fail on native Node modules.
- **UI:** React 19, styled per `DESIGN.md`.
- **Media Engine:** FFmpeg and ffprobe as subprocesses. Build invocations as **argv arrays** in pure functions. Never use `shell: true`, never interpolate values into a shell string.
- **Slides / Motion Graphics:** Remotion compositions in `tools/remotion`, previewed with `@remotion/player`. Remotion emits frames; FFmpeg composites.
- **Local-First Media:** All media processing happens locally. Cloud APIs are ONLY for transcription, LLM planning, and (later) generated assets.
- **Provider Agnostic:** AI features MUST use the abstraction in `packages/ai`. No vendor SDK imports outside that package.
- **Safety:** Validate and resolve every user-supplied path before it reaches a subprocess. Escape all values placed in an FFmpeg filtergraph with the dedicated escaper.
- **Measure Workflow:** Use the Measure skill. Always update `measure/tracks.md` and the current track's `plan.md` before starting work.
- **Performance:** Long-running media work runs in the job registry, never in a request handler or a React render. Progress reaches the UI through the job events, not polling inside components.
- **Linux Focus:** Optimise for Ubuntu/GNOME. Wayland and X11 must both work.
- **Project Structure:** `apps/web` (vinext app), `packages/{core,media,storyboard,slides,ai}`, `tools/remotion`.
- **Legacy code:** `cmd/`, `internal/`, `go.mod`, and `go.sum` are retired reference only. Do not add features there. They are deleted once the rewrite reaches export parity.

## Build System

Prerequisites: Node.js 24, npm, and `ffmpeg` + `ffprobe` on `PATH`.

```bash
npm install
npm run dev      # vinext dev server with HMR
npm run build    # production build
npm run start    # serve the build
npm run check    # typecheck + lint + test + build (CI gate)
```

`npm run check` replaces the old `make check` and is the required pre-commit validation.

The repository also carries `pnpm-workspace.yaml`, so pnpm works if it is available; the npm workspace definition in `package.json` is the source of truth.

## Automation Supervisor

Do NOT modify measure/automation-supervisor.py. This file is centrally managed and hardlinked across all projects.
