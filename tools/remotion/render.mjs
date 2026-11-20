import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(here, "src");
const BUNDLE_DIR = path.join(here, ".bundle");
const STAMP = path.join(BUNDLE_DIR, "source-hash.txt");

// Remotion can drive the system Chrome, which avoids a ~150 MB download.
const BROWSER = process.env.VERBAL_CHROME ?? "/usr/bin/google-chrome";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") {
    throw new Error("renderSlide: empty request on stdin");
  }
  return JSON.parse(raw);
}

async function sourceHash(directory) {
  const hash = createHash("sha256");
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();

  for (const name of names) {
    const full = path.join(directory, name);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      hash.update(await sourceHash(full));
    } else {
      hash.update(name);
      hash.update(await fs.readFile(full));
    }
  }

  return hash.digest("hex");
}

async function ensureBundle() {
  const current = await sourceHash(SOURCE_DIR);

  try {
    const previous = (await fs.readFile(STAMP, "utf8")).trim();
    if (previous === current) {
      return BUNDLE_DIR;
    }
  } catch {
    // No stamp: bundle below.
  }

  const serveUrl = await bundle({
    entryPoint: path.join(SOURCE_DIR, "index.ts"),
    outDir: BUNDLE_DIR,
    onProgress: () => undefined,
  });

  await fs.writeFile(STAMP, current);
  return serveUrl;
}

/** Colour type lives at byte 25 of a PNG (after signature + IHDR width/height). */
async function pngHasAlpha(file) {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(26);
    await handle.read(buffer, 0, 26, 0);
    const colorType = buffer[25];
    return colorType === 4 || colorType === 6;
  } finally {
    await handle.close();
  }
}

function toPattern(fileName) {
  const match = /\d+/.exec(fileName);
  if (match === null) {
    return "frame-%04d.png";
  }
  const width = match[0].length;
  return `${fileName.slice(0, match.index)}%0${width}d${fileName.slice(match.index + width)}`;
}

async function main() {
  const request = await readStdin();
  const {
    template,
    props = {},
    durationSeconds,
    fps = 30,
    width = 1920,
    height = 1080,
    outputDirectory,
  } = request;

  if (typeof template !== "string" || template === "") {
    throw new Error("renderSlide: template is required");
  }
  if (typeof outputDirectory !== "string" || outputDirectory === "") {
    throw new Error("renderSlide: outputDirectory is required");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("renderSlide: durationSeconds must be positive");
  }

  const serveUrl = await ensureBundle();
  const inputProps = { ...props, durationSeconds, fps, width, height };

  const selected = await selectComposition({
    serveUrl,
    id: template,
    inputProps,
    browserExecutable: BROWSER,
  });

  const composition = {
    ...selected,
    durationInFrames: Math.max(1, Math.round(durationSeconds * fps)),
    fps,
    width,
    height,
  };

  await fs.mkdir(outputDirectory, { recursive: true });

  await renderFrames({
    composition,
    serveUrl,
    inputProps,
    outputDir: outputDirectory,
    imageFormat: "png",
    browserExecutable: BROWSER,
    concurrency: 1,
    onStart: () => undefined,
    onFrameUpdate: () => undefined,
  });

  const files = (await fs.readdir(outputDirectory))
    .filter((file) => file.endsWith(".png"))
    .sort();

  if (files.length === 0) {
    throw new Error("renderSlide: no frames were written");
  }

  const manifest = {
    frames: files.length,
    fps,
    width,
    height,
    hasAlpha: await pngHasAlpha(path.join(outputDirectory, files[0])),
    pattern: toPattern(files[0]),
  };

  process.stdout.write(JSON.stringify(manifest));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
