import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
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

const asrWords = [
  { word: "hello", start: 0, end: 0.6 },
  { word: "um", start: 0.6, end: 0.9 },
  { word: "world", start: 0.9, end: 2 },
];
let asrCalls = 0;

const asr = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/audio/transcriptions") {
    response.statusCode = 404;
    response.end("{}");
    return;
  }

  request.resume();
  request.on("end", () => {
    asrCalls += 1;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        text: asrWords.map((word) => word.word).join(" "),
        language: "en",
        words: asrWords,
      }),
    );
  });
});

await new Promise((resolve) => asr.listen(0, "127.0.0.1", resolve));
const asrBaseUrl = `http://127.0.0.1:${asr.address().port}/v1`;

const home = await mkdtemp(path.join(os.tmpdir(), "verbal-home-"));
const projectRoot = await mkdtemp(path.join(os.tmpdir(), "verbal-e2e-"));
const serverLog = [];

const server = spawn(process.execPath, ["dist/standalone/server.js"], {
  cwd: path.resolve("apps/web"),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOME: home,
    OPENAI_API_KEY: "e2e-fake-key",
    OPENAI_BASE_URL: asrBaseUrl,
  },
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
        { id: "w0", text: "hello", start: 0, end: 0.6 },
        { id: "w1", text: "um", start: 0.6, end: 0.9 },
        { id: "w2", text: "world", start: 0.9, end: 2 },
      ],
      segments: [{ id: "s0", wordIds: ["w0", "w1", "w2"] }],
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
  // A project without a transcript answers 404 for these probes; the page reads
  // that as "nothing transcribed yet", so it is not a browser error.
  const EXPECTED_MISSING = ["/api/transcript", "/api/cleanup"];

  page.on("response", (response) => {
    if (response.status() < 400 || response.url().includes("favicon")) {
      return;
    }

    const { pathname } = new URL(response.url());
    if (response.status() === 404 && EXPECTED_MISSING.includes(pathname)) {
      return;
    }

    errors.push(`http ${response.status()}: ${response.url()}`);
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
  const waitForSavedState = (saved) =>
    page.waitForFunction(
      (expected) => document.querySelector('[role="status"]')?.textContent === expected,
      saved ? "Saved" : "Unsaved changes",
      { timeout: 5000 },
    );
  await editorPanel.waitFor();
  await editorPanel.getByRole("button", { name: "hello" }).waitFor();
  console.log("transcript: rendered");

  // Search: find a word, see it highlighted, and step to the match.
  const search = editorPanel.getByLabel("Find");
  await search.fill("world");
  await editorPanel.getByText("1 of 1").waitFor();
  assert(
    (await editorPanel.getByRole("button", { name: "world" }).getAttribute("data-match")) ===
      "true",
    "a search match should be marked in the editor",
  );
  await editorPanel.getByRole("button", { name: "Next match" }).click();
  assert(
    (await editorPanel
      .getByRole("button", { name: "world" })
      .getAttribute("data-selected")) === "true",
    "stepping to a match should select it",
  );
  await search.fill("");
  console.log("search: found and stepped to a match");

  // Structural edits: split a segment at a word, insert silence, undo both.
  const editorSegments = page.locator('[aria-label="Transcript"] .transcript__segment');
  const segmentsBefore = await editorSegments.count();
  // "world" is mid-segment; splitting at a segment head is a no-op by design.
  await editorPanel.getByRole("button", { name: "world" }).click();

  await editorPanel.getByRole("button", { name: "Split segment" }).click();
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('[aria-label="Transcript"] .transcript__segment').length ===
      expected,
    segmentsBefore + 1,
  );

  await editorPanel.getByRole("button", { name: "Insert silence" }).click();
  await page.getByText("Unsaved changes").waitFor();

  await editorPanel.getByRole("button", { name: "Undo" }).click();
  await editorPanel.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('[aria-label="Transcript"] .transcript__segment').length ===
      expected,
    segmentsBefore,
  );
  console.log("structure: split a segment, inserted silence, and undid both");

  // Reorder: move a word earlier, check the order, then undo it.
  const words = () => editorPanel.locator(".transcript__word").allTextContents();
  await editorPanel.getByRole("button", { name: "world" }).click();
  await editorPanel.getByRole("button", { name: "Move earlier" }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[aria-label="Transcript"] .transcript__word')]
        .map((word) => word.textContent)
        .join(" ") === "hello world um",
  );
  await editorPanel.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[aria-label="Transcript"] .transcript__word')]
        .map((word) => word.textContent)
        .join(" ") === "hello um world",
  );
  assert((await words()).join(" ") === "hello um world", "undo should restore the order");
  console.log("reorder: moved a word and undid it");

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
    assert(seeked >= 0.6 && seeked <= 1.5, `clicking a word should seek to ~0.9s, got ${seeked}s`);
    await playback.getByRole("button", { name: "Pause" }).click();
    console.log("playback: click-to-seek");

    // The waveform is rendered from the real clip and seeks where it is clicked.
    const waveform = playback.getByAltText("Waveform");
    await waveform.waitFor({ timeout: 20000 });
    const box = await waveform.boundingBox();
    assert(box !== null && box.width > 0, "the waveform should have a size");
    await waveform.click({ position: { x: Math.floor(box.width * 0.75), y: 5 } });
    const sought = await video.evaluate((media) => media.currentTime);
    assert(
      sought > duration * 0.5 && sought <= duration,
      `a waveform click at 75% should seek past halfway, got ${sought}s of ${duration}s`,
    );
    console.log("playback: waveform seek");
  }

  // The fixture's "um" is the only proposal the detector should find.
  const cleanup = page.getByRole("region", { name: "Cleanup", exact: true });
  await cleanup.waitFor();
  await cleanup.getByText("0 of 1 proposals accepted").waitFor();

  await cleanup.getByLabel("Accept all filler").check();
  await cleanup.getByText("1 of 1 proposals accepted").waitFor();

  await cleanup.getByRole("button", { name: "Remove accepted" }).click();
  await page.getByText(/Removed 1 cleanup proposal/).waitFor();
  assert(
    await editorPanel.getByRole("button", { name: "um" }).isDisabled(),
    "the accepted filler should be removed from the document",
  );

  await editorPanel.getByRole("button", { name: "Save transcript" }).click();
  await waitForSavedState(true);
  await page.getByText("Transcript saved").waitFor();
  console.log("cleanup: reviewed, removed, and saved");

  await cleanup.getByRole("button", { name: "Freeze master" }).click();
  await page.getByText(/Frozen master: \d+\.\d{2}s · \d+ anchors/).waitFor();
  console.log("cleanup: froze the master");

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
  assert(
    await editorPanel.getByRole("button", { name: "world" }).isDisabled(),
    "the deleted word should stay in the document, disabled",
  );
  console.log("transcript: deleted the selection with the keyboard");

  await editorPanel.getByRole("button", { name: "Undo" }).click();
  assert(
    !(await editorPanel.getByRole("button", { name: "world" }).isDisabled()),
    "undo should restore the deleted word",
  );

  await editorPanel.getByRole("button", { name: "Redo" }).click();
  assert(
    await editorPanel.getByRole("button", { name: "world" }).isDisabled(),
    "redo should re-apply the deletion",
  );
  assert((await dirtyStatus.textContent()) === "Unsaved changes", "the redo should be unsaved");

  // No Save click: the settled edit must reach Saved on its own.
  await waitForSavedState(true);
  console.log("transcript: undo, redo, and autosaved the result");

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
  assert(
    (await editorPanel.getByRole("button", { name: "um" }).getAttribute("data-removed")) ===
      "true",
    "the accepted filler should stay removed after a reload",
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

  // The export preset is a visible choice, not a hard-coded codec bundle.
  const preset = page.getByLabel("Preset");
  assert((await preset.inputValue()) === "web-h264", "the web preset should be the default");
  await preset.selectOption("webm-vp9");
  assert((await preset.inputValue()) === "webm-vp9", "the preset choice should stick");
  await preset.selectOption("web-h264");
  console.log("export: selected a preset");

  // Pruning reports before deleting; this project has no generated assets.
  await page.getByRole("button", { name: "Check prunable assets" }).click();
  await page.getByText("No generated assets are prunable").waitFor();
  console.log("assets: reported that nothing is prunable");

  // Transcription runs on a second project, so the hand-written fixture used by
  // the earlier checks stays untouched.
  const transcribedRoot = await mkdtemp(path.join(os.tmpdir(), "verbal-transcribed-"));
  await api("POST", "/api/projects", { root: transcribedRoot, name: "Transcribed" });

  if (mediaImported) {
    await api("POST", "/api/media/import", {
      projectRoot: transcribedRoot,
      sourcePath: clipPath,
      mode: "copy",
    });

    await page.getByLabel("Folder").fill(transcribedRoot);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByText("Opened Transcribed").waitFor();

    await page.getByRole("button", { name: "Transcribe media" }).click();
    await page.getByText(/Transcribed 3 words/).waitFor();

    const transcribedWords = page.getByRole("region", {
      name: "Transcript editor",
      exact: true,
    });
    await transcribedWords.getByRole("button", { name: "hello" }).waitFor();
    assert(asrCalls >= 1, "the fake ASR server should have been called");

    // The fake transcript contains a filler, so cleanup offers to remove it.
    await page
      .getByRole("region", { name: "Cleanup", exact: true })
      .getByText("0 of 1 proposals accepted")
      .waitFor();
    console.log("transcription: transcribed the clip from the page");
  }

  if (mediaImported) {
    // A batch over an already-transcribed project and a fresh one: the plan
    // should skip the first and transcribe the second.
    const batchRoot = await mkdtemp(path.join(os.tmpdir(), "verbal-batch-"));
    await api("POST", "/api/projects", { root: batchRoot, name: "Batched" });
    await api("POST", "/api/media/import", {
      projectRoot: batchRoot,
      sourcePath: clipPath,
      mode: "copy",
    });

    await page.getByLabel(/Batch projects/).fill(`${transcribedRoot}\n${batchRoot}`);
    await page.getByRole("button", { name: "Start batch" }).click();
    await page.getByText(/Batch done/).waitFor({ timeout: 30000 });

    const outcomes = page.getByLabel("Batch outcomes");
    await outcomes.waitFor();
    const rows = await outcomes.locator("li").allTextContents();
    assert(
      rows.some((row) => row.includes("transcribed")) &&
        rows.some((row) => row.includes("skipped")),
      `a batch should report both outcomes, got ${JSON.stringify(rows)}`,
    );
    console.log("transcription: ran a batch across two projects");
  }

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
  await new Promise((resolve) => asr.close(resolve));
}
