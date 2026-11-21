# Specification: UI Rebuild to Spec

## Why this exists

The app was built by accretion: eleven panels became a three-pane shell, the shell
gained modes, the project entry point became two path fields and then a browser
that opens at the wrong folder. Each step added; almost nothing was removed. The
result is a window that no longer scrolls but still has **two ways to open a
project, neither of them a picker**. This spec replaces that accretion with one
reviewed design, and explicitly lists what gets deleted.

## The product in one line

A local-first, single-window editor where you edit the video by editing its
transcript. Nothing here changes that; this spec only decides where things live.

## Information architecture

One window, three modes, one way in.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Verbal   Release notes · assets/take.mp4     [ Ingest | Edit | Deliver ]  ● │
├─────────────────────────┬─────────────────────────────────┬───────────────┤
│ BROWSER                 │ WORKSPACE                       │ INSPECTOR     │
│ (Ingest only)           │ (per mode, scrolls if needed)   │ (per mode)    │
│                         │                                 │               │
│ ⌂ /home/you  ↑  Home    │  Ingest: Capture                │  Edit:        │
│ ├ ▸ Verbal     (project)│  Edit:   player + waveform      │   Cleanup     │
│ ├ ▸ dogfood    (folder) │          transcript             │   Freeze      │
│ │   ├ Open release-notes│  Deliver: storyboard + preview  │  Deliver:     │
│ │   └ Enter tutorial    │                                 │   Export      │
│ └ ▸ Pictures   (folder) │                                 │               │
│ + New project here      │                                 │               │
├─────────────────────────┴─────────────────────────────────┴───────────────┤
│ Ready · media loaded · Opened Release notes                    ⌘S Saved    │
└───────────────────────────────────────────────────────────────────────────┘
```

Rules that make the picture hold:

1. **One entry point.** The browser on the left is the only way to open a project.
   There is no path input anywhere in the app.
2. **The browser starts at `$HOME`** and remembers the last folder visited
   (localStorage, client-only). Up/Home always work.
3. **Rows say what they are.** A project row offers *Open <name>* and shows name,
   word count, media presence; a plain folder offers *Enter <name>*.
4. **Creating lives with browsing.** *New project here* creates in the folder being
   browsed, so the folder is a choice, not a typed path.
5. **Modes own their inspector.** Edit owns Cleanup/Freeze, Deliver owns Export.
   A mode never shows another mode's panel.
6. **The status bar is the only place async news appears** (`aria-live="polite"`),
   so nothing jumps the layout.

## Pane inventory (exhaustive — anything else is deleted)

| Mode | Browser | Workspace | Inspector |
|---|---|---|---|
| Ingest | project browser + new project | Capture | — |
| Edit | hidden | player (video + waveform + transport), transcript editor | Cleanup, Freeze |
| Deliver | hidden | storyboard scenes, preview | Export |

Deleted outright: the rail Project panel (Folder/Name/Create/Open), the
`ProjectPicker` component and its test, the *Projects folder → Scan folder* form,
`GET /api/projects/list`, and `scanLibrary`'s list UI usage.

## The project browser contract

- `GET /api/fs/list?path=<absolute|omitted>` → `{ path, parent, entries[] }`, where
  each entry is `{ name, path, isProject, summary? }` and `summary` carries
  `{ name, transcriptWords, hasMedia, createdAt }` for project rows, so the list is
  informative without a request per row.
- Directories only; projects sorted first; `parent: null` at `/`.
- Errors: relative path → 400 with a fix ("Choose a folder"), missing folder → 404.
- Default when `path` is omitted: the server's home directory.
- Local-only endpoint on a localhost-bound server; documented as such.

## States each surface must handle

| Surface | Empty | Loading | Error | Full |
|---|---|---|---|---|
| Browser | "No projects in this folder — create one here" | "Reading folder…" | message + the folder still navigable | rows |
| Transcript | "Transcribe to get a transcript" | job progress in status bar | API message, retry offered | words |
| Player | "No media yet — import a take" | poster/spinner | "Media could not be loaded" + path | video + waveform |
| Cleanup | "Nothing to clean" | — | API message | proposals + Freeze |
| Deliver | "No scenes yet" | preview job progress | render error text | preview + scenes |

## Craft bar (from the fetched Web Interface Guidelines)

Already fixed: `color-scheme: dark`, `:focus-visible` ring, `prefers-reduced-motion`,
`touch-action: manipulation`, `overscroll-behavior: contain`, `autocomplete="off"`.
Still required by this rebuild:

- Every control has a label or `aria-label`; icon-only buttons are labelled.
- Async status is announced (`role="status"`, `aria-live="polite"`).
- Loading copy ends in `…`; no `transition: all`; tabular numerals for counts/times.
- Long names truncate with `min-width: 0`; lists >50 rows virtualise later (noted, not built).
- Title Case on buttons and headings; active voice; errors state the next step.
- Focus order follows the visual order; the browser is keyboard-operable end to end.

## Acceptance criteria

- [ ] One way to open a project: a browser, starting at home, no text path input.
- [ ] Zero page scroll at 1440×900 **and** 1280×800 in all three modes.
- [ ] A project opens in ≤2 clicks from launch (row → Open), and in ≤4 from any folder.
- [ ] Nine panels exist; the deleted list above is gone from the tree.
- [ ] `tools/e2e/walkthrough.mjs` drives the browser, not removed fields; it passes.
- [ ] The four dogfood projects are re-verified with a screenshot per mode.
- [ ] `npm run check` green.

## Explicitly out of scope

No token or type changes (DESIGN.md stands), no new features, no multi-window, no
mobile layout, no command palette. If a later idea needs one of those, it gets its
own spec rather than being folded in here.
