import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

/**
 * Browser walkthrough for the storyboard page.
 *
 * Starts the standalone server, drives the real UI in Chromium, and fails on
 * any page error or console error. Run with `npm run e2e`.
 */

const PORT = Number(process.env.E2E_PORT ?? 3220);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.E2E_CHROME ?? "/usr/bin/google-chrome";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/system`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server did not become ready");
}

async function api(method, path, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

if (process.env.E2E_SKIP_BUILD !== "1") {
  execFileSync("npm", ["run", "build"], { stdio: "inherit" });
}

const home = await mkdtemp(path.join(os.tmpdir(), "verbal-home-"));
const projectRoot = await mkdtemp(path.join(os.tmpdir(), "verbal-e2e-"));
const serverLog = [];

const server = spawn(process.execPath, ["dist/standalone/server.js"], {
  cwd: path.resolve("apps/web"),
  env: { ...process.env, PORT: String(PORT), HOME: home },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
server.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

const errors = [];
let browser;

try {
  await waitForServer();
  console.log("server: ready");

  await api("POST", "/api/projects", { root: projectRoot, name: "Walkthrough" });
  await api("PUT", "/api/transcript", {
    root: projectRoot,
    document: {
      schemaVersion: 1,
      words: [
        { id: "w0", text: "hello", start: 0, end: 1 },
        { id: "w1", text: "world", start: 1, end: 2 },
      ],
      segments: [{ id: "s0", wordIds: ["w0", "w1"] }],
      removedWordIds: [],
    },
  });
  await api("PUT", "/api/storyboard", {
    root: projectRoot,
    document: {
      schemaVersion: 1,
      scenes: [
        {
          id: "s1",
          anchor: { startWordId: "w0", endWordId: "w1" },
          visual: "slide",
          layer: "speaker-inset",
          template: "title",
          props: { title: "Walkthrough" },
        },
        {
          id: "g1",
          anchor: { startWordId: "w0", endWordId: "w0" },
          visual: "generated-image",
          layer: "full-frame",
        },
        {
          id: "v1",
          anchor: { startWordId: "w1", endWordId: "w1" },
          visual: "generated-video",
          layer: "full-frame",
        },
      ],
    },
  });
  console.log("fixture: project + transcript + storyboard");

  // A real clip, so playback is exercised against real bytes and real ranges.
  const clips = await mkdtemp(path.join(os.tmpdir(), "verbal-clip-"));
  const clipPath = path.join(clips, "take.webm");
  let mediaImported = false;

  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=size=320x180:rate=30",
        "-f", "lavfi",
        "-i", "sine=frequency=440",
        "-t", "2",
        "-c:v", "libvpx-vp9",
        "-b:v", "200k",
        "-c:a", "libopus",
        clipPath,
      ],
      { stdio: "ignore" },
    );
    await api("POST", "/api/media/import", {
      projectRoot,
      sourcePath: clipPath,
      mode: "copy",
    });
    mediaImported = true;
    console.log("fixture: imported a 2s clip");
  } catch {
    console.log("fixture: ffmpeg unavailable, playback checks skipped");
  }

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("favicon") &&
      !message.text().startsWith("Failed to load resource")
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("favicon")) {
      errors.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (!request.url().includes("favicon")) {
      errors.push(`request failed: ${request.url()}`);
    }
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  console.log("page: loaded");

  await page.getByLabel("Folder").fill(projectRoot);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByText("Opened Walkthrough").waitFor();
  console.log("project: opened from the UI");

  const editorPanel = page.getByRole("region", { name: "Transcript editor" });
  await editorPanel.waitFor();
  await editorPanel.getByRole("button", { name: "hello" }).waitFor();
  console.log("transcript: rendered");

  if (mediaImported) {
    const playback = page.getByRole("region", { name: "Playback", exact: true });
    await playback.waitFor();

    await page.waitForFunction(
      () => {
        const media = document.querySelector("video[aria-label='Media preview']");
        return media !== null && media.readyState >= 1 && media.duration > 0;
      },
      null,
      { timeout: 15000 },
    );

    const video = page.getByLabel("Media preview");
    const duration = await video.evaluate((media) => media.duration);
    assert(duration > 1.5, `expected a ~2s clip, got ${duration}s`);

    await playback.getByRole("button", { name: "Play" }).click();
    await page.locator('[data-active="true"]').first().waitFor({ timeout: 5000 });
    console.log("playback: the active word follows playback");

    await playback.getByRole("button", { name: "world" }).click();
    const seeked = await video.evaluate((media) => media.currentTime);
    assert(seeked >= 0.7 && seeked <= 1.6, `clicking a word should seek to ~1s, got ${seeked}s`);
    await playback.getByRole("button", { name: "Pause" }).click();
    console.log("playback: click-to-seek");
  }

  // Select a range, delete it with the keyboard, undo, redo, and save.
  // The playback panel renders its own transcript, so editor steps are scoped.
  const transcriptRegion = page.getByRole("region", { name: "Transcript", exact: true });
  const dirtyStatus = page.getByRole("status");

  await editorPanel.getByRole("button", { name: "hello" }).click();
  await editorPanel.getByRole("button", { name: "world" }).click({ modifiers: ["Shift"] });
  assert(
    (await editorPanel
      .getByRole("button", { name: "world" })
      .getAttribute("data-selected")) === "true",
    "shift-click should mark the range as selected",
  );

  await transcriptRegion.press("Delete");
  await page.getByText("Unsaved changes").waitFor();
  assert(
    await editorPanel.getByRole("button", { name: "world" }).isDisabled(),
    "the deleted word should stay in the document, disabled",
  );
  console.log("transcript: deleted the selection with the keyboard");

  await editorPanel.getByRole("button", { name: "Undo" }).click();
  assert(
    (await dirtyStatus.textContent()) === "Saved",
    "undo back to the loaded document should be clean",
  );
  assert(
    !(await editorPanel.getByRole("button", { name: "world" }).isDisabled()),
    "undo should restore the deleted word",
  );

  await editorPanel.getByRole("button", { name: "Redo" }).click();
  assert(
    (await dirtyStatus.textContent()) === "Unsaved changes",
    "redo should re-apply the deletion",
  );
  console.log("transcript: undo and redo");

  await editorPanel.getByRole("button", { name: "Save transcript" }).click();
  await page.getByText("Transcript saved").waitFor();
  assert((await dirtyStatus.textContent()) === "Saved", "saving should clear the dirty state");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Folder").fill(projectRoot);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByText("Opened Walkthrough").waitFor();
  assert(
    (await editorPanel
      .getByRole("button", { name: "world" })
      .getAttribute("data-removed")) === "true",
    "the removal should survive a reload",
  );
  console.log("transcript: saved edit survives a reload");

  const storyboardText = page.getByLabel("Storyboard JSON");
  assert((await storyboardText.inputValue()).includes("Walkthrough"), "storyboard should load");

  await page.getByRole("button", { name: "Fast preview" }).click();
  await page.getByRole("region", { name: "Storyboard preview" }).waitFor();
  await page.getByText("Placeholder").first().waitFor();
  console.log("preview: fast tier planned a placeholder");

  await page.getByLabel("Patch JSON").fill(
    JSON.stringify({
      patches: [{ type: "update-props", sceneId: "s1", props: { title: "Changed" } }],
    }),
  );
  await page.getByRole("button", { name: "Parse patches" }).click();
  await page.getByRole("region", { name: "Patch review" }).waitFor();
  await page.getByRole("button", { name: "Apply selected" }).click();
  await page.getByText("Patches applied").waitFor();
  assert(
    (await storyboardText.inputValue()).includes("Changed"),
    "applied patch should update the storyboard",
  );
  console.log("feedback: parsed, reviewed, and applied");

  await page.getByLabel("Image scene").fill("g1");
  await page.getByLabel("Image prompt").fill("a diagram");
  await page.getByRole("button", { name: "Estimate image" }).click();
  await page.getByText(/Estimated cost: \$0\.04/).waitFor();
  console.log("image: cost estimated before generation");

  await page.getByLabel("Video scene").fill("v1");
  await page.getByLabel("Video prompt").fill("a clip");
  await page.getByRole("button", { name: "Estimate video" }).click();
  await page.getByText(/Estimated clip cost: \$0\.40/).waitFor();
  console.log("video: cost estimated before generation");

  assert(errors.length === 0, `browser errors:\n${errors.join("\n")}`);
  console.log("browser: no console or page errors");
  console.log("walkthrough: PASS");
} catch (error) {
  console.error("walkthrough: FAIL");
  console.error(error instanceof Error ? error.message : error);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
  }
  if (serverLog.length > 0) {
    console.error("--- server log ---");
    console.error(serverLog.join(""));
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
