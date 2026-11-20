# Remotion slide renderer

Renders one storyboard scene to an alpha-preserving PNG sequence and reports a manifest. Runs as a child process; `packages/compose` talks to it through stdin/stdout.

## Input contract (stdin JSON)

```json
{
  "template": "title",
  "props": { "title": "Hello", "subtitle": "World" },
  "durationSeconds": 3,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "outputDirectory": "/absolute/path"
}
```

## Output manifest (stdout JSON)

```json
{
  "frames": 90,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "hasAlpha": true,
  "pattern": "element-%04d.png"
}
```

Errors go to stderr and the process exits non-zero.

## Templates and props

| Template id | Props |
| --- | --- |
| `title` | `title`, `subtitle` |
| `section` | `title`, `subtitle` |
| `bullets` | `title`, `bullets[]` |
| `quote` | `quote`, `attribution` |
| `code` | `code`, `language` |
| `lower-third` | `name`, `role` |

Every template except `code` leaves the background transparent, so the frames can be keyed over the speaker. `code` paints a dark panel deliberately.

## Browser

Uses `/usr/bin/google-chrome` by default, so no per-project Chromium download is needed. Set `VERBAL_CHROME` to point at another executable.

## Bundle cache

`.bundle/` is reused until anything in `src/` changes; a source hash is written to `.bundle/source-hash.txt`.

## Commands

```bash
npm run smoke    # render 1 second at 320x180 and print the manifest
npm run studio   # open Remotion Studio
```
