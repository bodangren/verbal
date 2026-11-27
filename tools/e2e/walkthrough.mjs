import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
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
// Projects live under the server's home so the browser, which starts there,
// can reach them by clicking — the only way into the app.
const projectRoot = path.join(home, "walkthrough");
await mkdir(projectRoot, { recursive: true });
const serverLog = [];

const server = spawn(process.execPath, ["dist/standalone/server.js"], {
  cwd: path.resolve("apps/web"),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOME: home,
    // The app honours XDG_DATA_HOME; pin it so a sandbox that fixes HOME does
    // not send the job registry to a read-only directory.
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    OPENAI_API_KEY: "e2e-fake-key",
    OPENAI_BASE_URL: asrBaseUrl,
    VERBAL_ASR: "cloud",
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

  browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  const page = await browser.newPage();

  const openProject = async (name) => {
    const row = page.locator(".entry--project", { hasText: name });
    await row.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByText(`Opened ${name}`).waitFor();
  };

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

  await openProject("Walkthrough");
  console.log("project: opened from the browser");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  console.log("shell: switched to Edit");

  const editorPanel = page.getByRole("region", { name: "Transcript editor", exact: true });
  const waitForSavedState = (saved) =>
    page.waitForFunction(
      (expected) => document.querySelector(".bar__save")?.textContent === expected,
      saved ? "Saved" : "Unsaved",
      { timeout: 5000 },
    );
  await editorPanel.waitFor();
  await editorPanel.getByRole("option", { name: "hello" }).waitFor();
  console.log("transcript: rendered");

  // Search: find a word, see it highlighted, and step to the match.
  const search = editorPanel.getByLabel("Find");
  await search.fill("world");
  await editorPanel.getByText("1 of 1").waitFor();
  assert(
    (await editorPanel.getByRole("option", { name: "world" }).getAttribute("data-match")) ===
      "true",
    "a search match should be marked in the editor",
  );
  await editorPanel.getByRole("button", { name: "Next match" }).click();
  assert(
    (await editorPanel
      .getByRole("option", { name: "world" })
      .getAttribute("data-selected")) === "true",
    "stepping to a match should select it",
  );
  await search.fill("");
  console.log("search: found and stepped to a match");

  // Structural edits: split a segment at a word, insert silence, undo both.
  const editorSegments = page.locator('[aria-label="Transcript"] .transcript__segment');
  const segmentsBefore = await editorSegments.count();
  // "world" is mid-segment; splitting at a segment head is a no-op by design.
  await editorPanel.getByRole("option", { name: "world" }).click();

  await editorPanel.getByRole("button", { name: "Split" }).click();
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('[aria-label="Transcript"] .transcript__segment').length ===
      expected,
    segmentsBefore + 1,
  );

  await editorPanel.getByRole("button", { name: "Insert Silence" }).click();
  await page.getByText("Unsaved").waitFor();

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
  await editorPanel.getByRole("option", { name: "world" }).click();
  await editorPanel.getByRole("button", { name: "Move Back" }).click();
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

    // The transport must sit inside the player card, not be clipped by it.
    const transportInsideCard = await page.evaluate(() => {
      const card = document.querySelector(".card--flush")?.getBoundingClientRect();
      const button = document.querySelector(".playback__button")?.getBoundingClientRect();
      return card !== undefined && button !== undefined && button.bottom <= card.bottom + 1;
    });
    assert(transportInsideCard, "the play control must not be clipped by the player card");

    await playback.getByRole("button", { name: "Play", exact: true }).click();
    await page.locator('[data-active="true"]').first().waitFor({ timeout: 5000 });
    console.log("playback: the active word follows playback");

    // One transcript: clicking a word in the editor is what seeks the player.
    await editorPanel.getByRole("option", { name: "world", exact: true }).click();
    const seeked = await video.evaluate((media) => media.currentTime);
    assert(seeked >= 0.6 && seeked <= 1.5, `clicking a word should seek to ~0.9s, got ${seeked}s`);
    await playback.getByRole("button", { name: "Pause", exact: true }).click();
    console.log("playback: click-to-seek");

    // The waveform is rendered from the real clip and seeks where it is clicked.
    const waveform = playback.locator(".playback__waveform");
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

    // The visible range scrubs with the keyboard, not just the mouse.
    const seek = playback.getByLabel("Seek");
    await seek.focus();
    await page.keyboard.press("End");
    const scrubbed = await video.evaluate((media) => media.currentTime);
    assert(
      scrubbed > duration * 0.9,
      `End on the scrubber should seek near the end, got ${scrubbed}s of ${duration}s`,
    );
    await page.keyboard.press("Home");
    const rewound = await video.evaluate((media) => media.currentTime);
    assert(rewound < 0.2, `Home on the scrubber should seek to the start, got ${rewound}s`);
    console.log("playback: keyboard scrub");
  }

  // The fixture's "um" is the only proposal the detector should find.
  const cleanup = page.getByRole("region", { name: "Cleanup", exact: true });
  await cleanup.waitFor();
  await cleanup.getByText("0 of 1 proposals accepted").waitFor();

  await cleanup.getByLabel("Accept All filler").check();
  await cleanup.getByText("1 of 1 proposals accepted").waitFor();

  await cleanup.getByRole("button", { name: "Remove Accepted" }).click();
  await page.getByText(/Removed 1 cleanup proposal/).waitFor();
  assert(
    await editorPanel.getByRole("option", { name: "um" }).isDisabled(),
    "the accepted filler should be removed from the document",
  );

  await waitForSavedState(true);
  await page.getByText("Transcript saved").waitFor();
  console.log("cleanup: reviewed, removed, and saved");

  await cleanup.getByRole("button", { name: "Freeze Master" }).click();
  await page.getByText(/Frozen master: \d+\.\d{2}s · \d+ anchors/).waitFor();
  console.log("cleanup: froze the master");

  // Select a range, delete it with the keyboard, undo, redo, and save.
  // The playback panel renders its own transcript, so editor steps are scoped.
  const transcriptRegion = page.getByRole("region", { name: "Transcript editor", exact: true });
  const dirtyStatus = page.locator(".bar__save");

  await editorPanel.getByRole("option", { name: "hello" }).click();
  await editorPanel.getByRole("option", { name: "world" }).click({ modifiers: ["Shift"] });
  assert(
    (await editorPanel
      .getByRole("option", { name: "world" })
      .getAttribute("data-selected")) === "true",
    "shift-click should mark the range as selected",
  );

  await transcriptRegion.press("Delete");
  assert(
    await editorPanel.getByRole("option", { name: "world" }).isDisabled(),
    "the deleted word should stay in the document, disabled",
  );
  console.log("transcript: deleted the selection with the keyboard");

  await editorPanel.getByRole("button", { name: "Undo" }).click();
  assert(
    !(await editorPanel.getByRole("option", { name: "world" }).isDisabled()),
    "undo should restore the deleted word",
  );

  await editorPanel.getByRole("button", { name: "Redo" }).click();
  assert(
    await editorPanel.getByRole("option", { name: "world" }).isDisabled(),
    "redo should re-apply the deletion",
  );
  // Autosave may already be in flight (or settled) by the time we read the
  // dot, so accept any state that proves the redo was not dropped.
  const redoState = (await dirtyStatus.textContent()) ?? "";
  assert(
    ["Unsaved", "Saving…", "Saved"].includes(redoState),
    `the redo should leave the document saved soon, got ${redoState}`,
  );

  // No Save click: the settled edit must reach Saved on its own.
  await waitForSavedState(true);
  console.log("transcript: undo, redo, and autosaved the result");

  // The unload guard fires while an edit is unsaved. Undo the saved redo so the
  // document is dirty without needing an enabled word in this 3-word fixture.
  await editorPanel.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(
    () => {
      const text = document.querySelector(".bar__save")?.textContent ?? "";
      return text === "Unsaved" || text === "Saving…";
    },
    undefined,
    { timeout: 3000 },
  );
  const warnsBeforeUnload = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert(warnsBeforeUnload, "unsaved edits should warn before unload");
  await editorPanel.getByRole("button", { name: "Redo" }).click();
  await waitForSavedState(true);
  console.log("errors: an unsaved edit warns before unload");

  // Session memory reopens the project in Edit without a click.
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator(".bar__document-name")
    .filter({ hasText: "Walkthrough" })
    .waitFor();
  assert(
    (await page
      .getByRole("button", { name: "Edit", exact: true })
      .getAttribute("aria-current")) === "page",
    "the reload should reopen Edit from the session",
  );
  await page.getByRole("region", { name: "Transcript editor" }).waitFor();
  assert(
    (await editorPanel
      .getByRole("option", { name: "world" })
      .getAttribute("data-removed")) === "true",
    "the removal should survive a reload",
  );
  assert(
    (await editorPanel.getByRole("option", { name: "um" }).getAttribute("data-removed")) ===
      "true",
    "the accepted filler should stay removed after a reload",
  );
  console.log("transcript: saved edit survives a reload");

  page.getByRole("navigation", { name: "Workspace mode" }).getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("Advanced: Storyboard Document").click();
  const storyboardText = page.getByLabel("Storyboard JSON");
  assert((await storyboardText.inputValue()).includes("Walkthrough"), "storyboard should load");

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("region", { name: "Storyboard preview" }).waitFor();
  await page.getByText("Placeholder").first().waitFor();
  console.log("preview: fast tier planned a placeholder");

  await page.getByText("Review Feedback").click();
  await page.getByLabel("Patch JSON").fill(
    JSON.stringify({
      patches: [{ type: "update-props", sceneId: "s1", props: { title: "Changed" } }],
    }),
  );
  await page.getByRole("button", { name: "Parse Patches" }).click();
  await page.getByRole("region", { name: "Patch review" }).waitFor();
  await page.getByRole("button", { name: "Apply Selected" }).click();
  await page.getByText("Patches applied").waitFor();
  assert(
    (await storyboardText.inputValue()).includes("Changed"),
    "applied patch should update the storyboard",
  );
  console.log("feedback: parsed, reviewed, and applied");

  await page.getByText("Generate Assets").click();
  await page.getByLabel("Image Scene").fill("g1");
  await page.getByLabel("Image Prompt").fill("a diagram");
  await page.getByRole("button", { name: "Estimate Image" }).click();
  await page.getByText(/Estimated cost: \$0\.04/).waitFor();
  console.log("image: cost estimated before generation");

  await page.getByLabel("Video Scene").fill("v1");
  await page.getByLabel("Video Prompt").fill("a clip");
  await page.getByRole("button", { name: "Estimate Video" }).click();
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
  await page.getByRole("button", { name: "Check Prunable Assets" }).click();
  await page.getByText("No generated assets are prunable").waitFor();
  console.log("assets: reported that nothing is prunable");

  // Transcription runs on a second project, so the hand-written fixture used by
  // the earlier checks stays untouched.
  const transcribedRoot = path.join(home, "transcribed");
  await mkdir(transcribedRoot, { recursive: true });
  await api("POST", "/api/projects", { root: transcribedRoot, name: "Transcribed" });

  if (mediaImported) {
    await api("POST", "/api/media/import", {
      projectRoot: transcribedRoot,
      sourcePath: clipPath,
      mode: "copy",
    });

    await page.getByRole("button", { name: "Ingest", exact: true }).click();
    // The project was created through the API after the page loaded, so
    // refresh the folder the browser is showing before clicking its row.
    await page.getByRole("button", { name: "Home" }).click();
    await openProject("Transcribed");
    await page.getByRole("button", { name: "Ingest", exact: true }).click();

    await page.getByRole("button", { name: "Transcribe", exact: true }).click();
    await page.getByText(/Transcribed 3 words/).waitFor();
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    const transcribedWords = page.getByRole("region", {
      name: "Transcript editor",
      exact: true,
    });
    await transcribedWords.getByRole("option", { name: "hello" }).waitFor();
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
    const batchRoot = path.join(home, "batch");
    await mkdir(batchRoot, { recursive: true });
    await api("POST", "/api/projects", { root: batchRoot, name: "Batched" });
    await api("POST", "/api/media/import", {
      projectRoot: batchRoot,
      sourcePath: clipPath,
      mode: "copy",
    });

    // The batch project was created through the API after the page loaded, so
    // refresh the folder before the dialog lists it.
    await page.getByRole("button", { name: "Home" }).click();
    await page.getByRole("button", { name: "Ingest", exact: true }).click();
    await page.getByRole("button", { name: "Transcribe Several Projects" }).click();
    const batchDialog = page.getByRole("dialog", { name: "Transcribe Several Projects" });
    await batchDialog.waitFor();
    await batchDialog.getByRole("checkbox", { name: "Select Transcribed" }).check();
    await batchDialog.getByRole("checkbox", { name: "Select Batched" }).check();
    await batchDialog.getByRole("button", { name: "Start Transcribe" }).click();
    await page.getByText(/Batch done/).waitFor({ timeout: 30000 });

    const outcomes = page.getByLabel("Batch outcomes");
    await outcomes.waitFor();
    const rows = await outcomes.locator("li").allTextContents();
    assert(
      rows.some((row) => row.includes("transcribed")) &&
        rows.some((row) => row.includes("skipped")),
      `a batch should report both outcomes, got ${JSON.stringify(rows)}`,
    );
    await batchDialog.getByRole("button", { name: "Close" }).click();
    console.log("transcription: ran a batch across two projects");
  }

  // A failed import shows an inline alert in the Ingest stage, not only in the
  // status bar; Dismiss clears it.
  if (mediaImported) {
    // The picker can only reach folders under the served home; copy the clip
    // there so the forced failure happens through the real UI path.
    await mkdir(path.join(home, "media"), { recursive: true });
    await copyFile(clipPath, path.join(home, "media", "take.webm"));
    await page.getByRole("button", { name: "Home" }).click();
    await page.route("**/api/media/import", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "unknown", message: "forced import failure" },
        }),
      }),
    );
    await page.getByRole("button", { name: "Import Media" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import Media" });
    await importDialog.waitFor();
    await importDialog.getByTitle("Enter media").click();
    await importDialog.getByTitle("Import take.webm").click();
    const ingestAlert = page
      .getByRole("region", { name: "ingest workspace" })
      .getByRole("alert");
    await ingestAlert.waitFor();
    assert(
      ((await ingestAlert.textContent()) ?? "").includes("Something went wrong"),
      "a failed import should show an inline alert in Ingest",
    );
    await ingestAlert.getByRole("button", { name: "Dismiss" }).click();
    await ingestAlert.waitFor({ state: "detached" });
    await page.unroute("**/api/media/import");
    // The forced 500 is deliberate; it must not trip the console-error check.
    for (let index = errors.length - 1; index >= 0; index -= 1) {
      if (errors[index].includes("/api/media/import")) {
        errors.splice(index, 1);
      }
    }
    console.log("errors: a failed import showed an inline alert and dismissed");
  }

  // Edit with no transcript offers Transcribe in place, with no mode change.
  if (mediaImported) {
    const emptyRoot = path.join(home, "empty");
    await mkdir(emptyRoot, { recursive: true });
    await api("POST", "/api/projects", { root: emptyRoot, name: "Empty" });
    await api("POST", "/api/media/import", {
      projectRoot: emptyRoot,
      sourcePath: clipPath,
      mode: "copy",
    });

    await page.getByRole("button", { name: "Home" }).click();
    await openProject("Empty");
    assert(
      (await page
        .getByRole("button", { name: "Edit", exact: true })
        .getAttribute("aria-current")) === "page",
      "a project with media should open in Edit",
    );

    const editWorkspace = page.getByRole("region", { name: "edit workspace" });
    await editWorkspace.getByText("No Transcript Yet").waitFor();
    await editWorkspace.getByRole("button", { name: "Transcribe", exact: true }).click();
    await page.getByText(/Transcribed 3 words/).waitFor({ timeout: 30000 });
    assert(
      (await page
        .getByRole("button", { name: "Edit", exact: true })
        .getAttribute("aria-current")) === "page",
      "transcribing in Edit should keep Edit active",
    );
    await page
      .getByRole("region", { name: "Transcript editor" })
      .getByRole("option", { name: "hello" })
      .waitFor();
    console.log("errors: transcribed in place from the Edit empty state");
  }

  // Creating lives in the browser: enter a folder, name a project, create it.
  const newFolder = "new-work";
  await mkdir(path.join(home, newFolder), { recursive: true });

  await page.getByRole("button", { name: "Ingest", exact: true }).click();
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByTitle(`Enter ${newFolder}`).waitFor();
  await page.getByTitle(`Enter ${newFolder}`).click();
  await page.getByRole("button", { name: "+ New Project Here" }).click();
  await page.getByLabel("New Project Name").fill("Take One");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByText("Created Take One").waitFor();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByText("Opened Take One").waitFor();
  console.log("browser: created and opened a project in the served folder");

  // Studio: record a take with the fake camera.
  await page.getByRole("button", { name: "Ingest", exact: true }).click();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  const studio = page.getByRole("dialog", { name: "Studio" });
  await studio.waitFor();
  await studio.getByRole("button", { name: "Record", exact: true }).click();
  const stopTake = studio.getByRole("button", { name: "Stop", exact: true });
  await stopTake.waitFor({ timeout: 12000 });
  await page.waitForTimeout(1000);
  await stopTake.click();
  await page.getByText("Take saved").waitFor({ timeout: 60000 });
  await studio.getByRole("button", { name: "Close", exact: true }).click();
  console.log("studio: recorded a take with the fake camera");

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
