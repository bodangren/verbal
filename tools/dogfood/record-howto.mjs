/**
 * Record a how-to session of Verbal with the real browser.
 *
 * Prepares a fixture project in the server's home, drives the UI through one
 * tour, and records the viewport. Writes `session.json` next to the video:
 * every step's start time is what the caption composer uses.
 *
 * Usage:
 *   DOGFOOD_BROWSERS_PATH=$TMPDIR/pw-browsers node tools/dogfood/record-howto.mjs
 *
 * The dev/standalone server must be running with a scratch HOME, because the
 * fixture is created as a child of that home:
 *   HOME=$TMPDIR/verbal-dogfood-home npm run dev
 */
import { execFileSync } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASE = process.env.DOGFOOD_BASE ?? "http://127.0.0.1:5173";
const OUT = process.env.DOGFOOD_OUT ?? path.join(os.tmpdir(), "verbal-dogfood");
const CHROME = process.env.DOGFOOD_CHROME ?? "/usr/bin/google-chrome";
const PROJECT_NAME = "How to edit a take";

/** Loaded after the ffmpeg registry is set: Playwright resolves it at import time. */
let chromium;

/** Browser video recording needs Playwright's own ffmpeg; use the system one. */
async function ensureFfmpeg() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH !== undefined) {
    return;
  }

  const registry = path.join(os.tmpdir(), "verbal-pw-browsers");
  const target = path.join(registry, "ffmpeg-1013", "ffmpeg-linux");
  await mkdir(path.dirname(target), { recursive: true });
  try {
    execFileSync("ln", ["-sf", "/usr/bin/ffmpeg", target]);
  } catch {
    // The link may already exist; the recorder will report if ffmpeg is missing.
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = registry;
}

async function api(method, url, body) {
  const response = await fetch(BASE + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${method} ${url} -> ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

const SCRIPT =
  "Hi, this is Verbal. You edit the video by editing its transcript. " +
  "Open a project from the browser on the left. " +
  "Press play, and the active word follows the audio. " +
  "Now scrub the timeline, or drag the range under the video. " +
  "Click any word to jump straight to it. " +
  "Select a filler, um, and delete it. The cut follows the text. " +
  "When you are happy, switch to Deliver to preview and export.";

function transcriptDocument(durationSeconds) {
  const tokens = SCRIPT.replace(/,/g, "").split(/\s+/).filter(Boolean);
  const step = durationSeconds / tokens.length;
  const words = tokens.map((text, index) => ({
    id: `w${index}`,
    text,
    start: Number((index * step).toFixed(3)),
    end: Number(((index + 1) * step).toFixed(3)),
  }));

  return {
    schemaVersion: 1,
    words,
    segments: [{ id: "s0", wordIds: words.map((word) => word.id) }],
    removedWordIds: [],
  };
}

async function prepareFixture() {
  const listing = await api("GET", "/api/fs/list");
  const home = listing.path;
  const projectRoot = path.join(home, "how-to-edit-a-take");
  const clip = path.join(OUT, "take.mp4");

  await rm(projectRoot, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // Neutral footage with a real audio track. A screen recording would show a
  // previous UI; a silent clip would leave the waveform with nothing to draw.
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f", "lavfi",
      "-i", "gradients=s=1280x720:c0=0x14141c:c1=0x2c2c4a:d=30",
      "-f", "lavfi",
      "-i", "aevalsrc=0.25*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*0.25*t)):s=48000:d=30",
      "-t", "30",
      "-shortest",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "26",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "96k",
      clip,
    ],
    { stdio: "ignore" },
  );

  await api("POST", "/api/projects", { root: projectRoot, name: PROJECT_NAME });
  await api("POST", "/api/media/import", {
    projectRoot,
    sourcePath: clip,
    mode: "copy",
  });
  await api("PUT", "/api/transcript", {
    root: projectRoot,
    document: transcriptDocument(30),
  });

  console.log(`fixture: ${projectRoot}`);
  return { home, projectRoot };
}

async function main() {
  await ensureFfmpeg();
  ({ chromium } = await import("playwright-core"));
  const { projectRoot } = await prepareFixture();

  const raw = path.join(OUT, "raw");
  await rm(raw, { recursive: true, force: true });
  await mkdir(raw, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const errors = [];
  const steps = [];
  let context;

  try {
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: raw, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  console.log("record: browser ready");
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) {
      errors.push(`console: ${message.text()}`);
    }
  });

  const started = Date.now();
  const mark = (id, caption) => {
    steps.push({ id, at: Number(((Date.now() - started) / 1000).toFixed(2)), caption });
  };

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator(".entry--project").first().waitFor({ timeout: 20000 });
  console.log("record: page loaded");
  await page.waitForTimeout(900);
  mark("intro", "A 30-second tour of Verbal");

  await page.waitForTimeout(1400);
  mark("open", "Open a project from the browser");
  await page
    .locator(".entry--project", { hasText: PROJECT_NAME })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page.waitForTimeout(1600);
  console.log("record: project open");

  mark("play", "Play: the active word follows the audio");
  await page.getByRole("region", { name: "Playback" }).getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(3200);
  await page.getByRole("region", { name: "Playback" }).getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(700);
  console.log("record: played");

  mark("scrub", "Scrub the timeline or drag the range");
  const seek = page.getByLabel("Seek");
  const seekBox = await seek.boundingBox();
  if (seekBox !== null) {
    await seek.click({ position: { x: seekBox.width * 0.55, y: seekBox.height / 2 } });
  }
  await page.waitForTimeout(1200);
  console.log("record: scrubbed");

  mark("word", "Click a word to jump to it");
  await page.getByRole("region", { name: "Transcript editor" }).getByRole("button", { name: "transcript" }).click();
  await page.waitForTimeout(1100);
  console.log("record: word seek");

  mark("edit", "Delete a filler; the cut follows the text");
  const editor = page.getByRole("region", { name: "Transcript editor" });
  await editor.getByRole("button", { name: "um", exact: true }).click();
  await editor.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(1200);
  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForTimeout(900);
  console.log("record: edited");

  mark("deliver", "Deliver: preview and export");
  await page
    .getByRole("navigation", { name: "Workspace mode" })
    .getByRole("button", { name: "Deliver", exact: true })
    .click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Fast preview", exact: true }).click();
  await page.waitForTimeout(2400);
  console.log("record: deliver");

  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  const files = (await readdir(raw)).filter((file) => file.endsWith(".webm"));
  if (files.length === 0) {
    throw new Error("the browser produced no recording");
  }

  const video = path.join(raw, files[0]);
  const session = {
    base: BASE,
    projectRoot,
    video,
    note: "Transcript is scripted: this machine has no ASR provider or whisper binary.",
    steps,
    errors,
  };
  const manifest = path.join(OUT, "session.json");
  await writeFile(manifest, JSON.stringify(session, null, 2));

  console.log(`video: ${video}`);
  console.log(`manifest: ${manifest}`);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
