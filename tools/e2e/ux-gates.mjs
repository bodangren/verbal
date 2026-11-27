/**
 * UX gate: measure the core journey and the shell.
 *
 * Reuses the walkthrough fixtures (fake ASR, temporary HOME, generated media)
 * and drives the real UI. Writes `ux-report.json` and exits non-zero when a
 * budget, an accessible name, a focus outline, a heading order or a disabled
 * primary style fails.
 *
 * Run: node tools/e2e/ux-gates.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { contrastRatio } from "./contrast.ts";
import { checkBudgets } from "./ux-budgets.ts";
import { countVisibleTranscriptLines } from "./transcript-lines.mjs";

const PORT = Number(process.env.UX_PORT ?? 3231);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.UX_CHROME ?? "/usr/bin/google-chrome";
const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1024, 700],
  [768, 1024],
  [360, 740],
];
const PROJECT = "UX gate";

if (process.env.UX_SKIP_BUILD !== "1") {
  execFileSync("npm", ["run", "build"], { stdio: "inherit" });
}

const SCRIPT = ["hello", "um", "world", "this", "is", "a", "long", "transcript"];
const asrWords = Array.from({ length: 200 }, (_, index) => ({
  word: SCRIPT[index % SCRIPT.length],
  start: Number((index * 0.01).toFixed(2)),
  end: Number(((index + 1) * 0.01).toFixed(2)),
}));

const asr = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/audio/transcriptions") {
    response.statusCode = 404;
    response.end("{}");
    return;
  }

  request.resume();
  request.on("end", () => {
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

const home = await mkdtemp(path.join(os.tmpdir(), "verbal-ux-home-"));
const mediaDir = path.join(home, "media");
await mkdir(mediaDir, { recursive: true });
const clip = path.join(mediaDir, "take.mp4");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x180:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440",
    "-t",
    "2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    clip,
  ],
  { stdio: "ignore" },
);

const serverLog = [];
const server = spawn(process.execPath, ["dist/standalone/server.js"], {
  cwd: path.resolve("apps/web"),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOME: home,
    OPENAI_API_KEY: "ux-fake-key",
    OPENAI_BASE_URL: asrBaseUrl,
    VERBAL_ASR: "cloud",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
server.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

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

function modeButton(page, name) {
  return page
    .getByRole("navigation", { name: "Workspace mode" })
    .getByRole("button", { name, exact: true });
}

async function measureMode(page, mode) {
  const measured = await page.evaluate((currentMode) => {
    const root = document.documentElement;
    const transcript = document.querySelector(".transcript");
    const transcriptBox = transcript?.getBoundingClientRect();
    const transcriptRect =
      transcriptBox === undefined ? null : { top: transcriptBox.top, bottom: transcriptBox.bottom };
    const stageBox = document.querySelector(".stage__scroll")?.getBoundingClientRect();
    const stageRect =
      stageBox === undefined
        ? null
        : { top: Math.max(stageBox.top, 0), bottom: Math.min(stageBox.bottom, window.innerHeight) };
    const words = [...document.querySelectorAll(".transcript__word")];
    const wordRects = words.map((word) => {
      const rect = word.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });

    const nameOf = (element) => {
      const aria = element.getAttribute("aria-label");
      if (aria !== null && aria.trim() !== "") {
        return aria.trim();
      }

      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy !== null) {
        const target = document.getElementById(labelledBy);
        if (target !== null && (target.textContent ?? "").trim() !== "") {
          return (target.textContent ?? "").trim();
        }
      }

      const labels =
        element.labels === undefined
          ? ""
          : [...element.labels]
              .map((label) => (label.textContent ?? "").trim())
              .filter(Boolean)
              .join(" ");
      if (labels !== "") {
        return labels;
      }

      const text = (element.textContent ?? "").trim();
      if (text !== "") {
        return text;
      }

      return (element.getAttribute("title") ?? element.getAttribute("placeholder") ?? "").trim();
    };

    const interactive = [...document.querySelectorAll("button,input,select,textarea,a[href]")];
    const nameless = interactive
      .filter((element) => nameOf(element) === "")
      .map((element) => ({
        mode: currentMode,
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").trim().slice(0, 40),
        id: element.id,
      }));

    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent ?? "").trim().slice(0, 40),
    }));

    const disabledPrimary = [...document.querySelectorAll("button:disabled")]
      .map((button) => ({
        mode: currentMode,
        text: (button.textContent ?? "").trim().slice(0, 40),
        background: getComputedStyle(button).backgroundColor,
      }))
      .filter((button) => /99,\s*102,\s*241/.test(button.background));

    return {
      pageScrollX: root.scrollWidth - root.clientWidth,
      pageScrollY: root.scrollHeight - root.clientHeight,
      wordRects,
      transcriptRect,
      stageRect,
      nameless,
      headings,
      disabledPrimary,
    };
  }, mode);

  const transcriptLines =
    measured.transcriptRect === null
      ? 0
      : countVisibleTranscriptLines(
          measured.wordRects,
          measured.transcriptRect,
          measured.stageRect ?? undefined,
        );
  return { ...measured, transcriptLines };
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(`pageerror: ${error.message}`));

const counts = { clicks: 0, keys: 0 };
const click = async (locator) => {
  await locator.click();
  counts.clicks += 1;
};
const type = async (locator, value) => {
  await locator.fill(value);
  counts.keys += 1;
};

try {
  await waitForServer();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator(".browser").waitFor({ timeout: 20000 });

  // The core journey, measured from the home screen to an editable transcript.
  // Enter submits the create form, so only revealing it is a click.
  await click(page.getByRole("button", { name: "+ New Project Here", exact: true }));
  await type(page.getByLabel("New Project Name"), PROJECT);
  await page.keyboard.press("Enter");
  await page.getByText(`Created ${PROJECT}`).waitFor();

  await click(page.getByRole("button", { name: "Import Media" }));
  const dialog = page.getByRole("dialog", { name: "Import Media" });
  await dialog.waitFor();
  await click(dialog.getByTitle("Enter media"));
  await click(dialog.getByTitle("Import take.mp4"));
  await page.getByText("Media imported", { exact: true }).waitFor();

  // Import starts on choose; Transcribe sits on the media row, and the
  // finished transcript lands in Edit without another mode click.
  await click(page.getByRole("button", { name: "Transcribe", exact: true }));
  await page.getByText(/Transcribed 200 words/).waitFor({ timeout: 30000 });
  await page
    .getByRole("region", { name: "Transcript editor" })
    .locator(".transcript__word")
    .first()
    .waitFor();

  const viewports = {};
  const nameless = [];
  const headings = [];
  const disabledPrimary = [];
  const exportVisibility = [];
  const narrowLayout = [];

  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    const key = `${width}x${height}`;
    viewports[key] = { pageScrollX: 0, pageScrollY: 0, transcriptLines: 0 };

    for (const mode of ["Ingest", "Edit", "Export"]) {
      await modeButton(page, mode).click();
      await page.waitForTimeout(250);
      const measured = await measureMode(page, mode);

      viewports[key].pageScrollX = Math.max(viewports[key].pageScrollX, measured.pageScrollX);
      viewports[key].pageScrollY = Math.max(viewports[key].pageScrollY, measured.pageScrollY);
      if (mode === "Edit") {
        viewports[key].transcriptLines = measured.transcriptLines;
      }

      nameless.push(...measured.nameless);
      headings.push(...measured.headings.map((heading) => ({ mode, ...heading })));
      disabledPrimary.push(...measured.disabledPrimary);
    }

    // At stacked widths the top bar wraps; Export must stay on screen and
    // the page itself must never scroll horizontally.
    if (width <= 900) {
      const exportBox = await page.evaluate(() => {
        const button = document.querySelector(".bar__export");
        if (button === null) {
          return null;
        }
        const rect = button.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          bar: [...document.querySelectorAll(".bar > *, .bar__actions > *")].map((el) => {
            const box = el.getBoundingClientRect();
            return {
              cls: String(el.className),
              left: Math.round(box.left),
              right: Math.round(box.right),
              top: Math.round(box.top),
            };
          }),
        };
      });
      exportVisibility.push({ viewport: key, box: exportBox });
      if (exportBox === null) {
        exportVisibility[exportVisibility.length - 1].failure =
          `${key}: no Export button in the top bar`;
      } else if (
        exportBox.left < 0 ||
        exportBox.top < 0 ||
        exportBox.right > exportBox.innerWidth ||
        exportBox.bottom > exportBox.innerHeight
      ) {
        exportVisibility[exportVisibility.length - 1].failure =
          `${key}: Export rect ${exportBox.left},${exportBox.top} to ` +
          `${exportBox.right},${exportBox.bottom} leaves the ` +
          `${exportBox.innerWidth}x${exportBox.innerHeight} viewport`;
      }
    }

    // At phone width the review saw what the budgets cannot: the collapsed
    // browser must stay usable, the search controls must stay on screen, and
    // the media name must stay readable.
    if (key === "360x740") {
      const strip = await page.evaluate(() => {
        const root = document.querySelector(".sidebar .browser");
        if (root === null) {
          return null;
        }
        const rect = root.getBoundingClientRect();
        return {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
      });
      narrowLayout.push({ viewport: key, check: "browser strip", box: strip });
      if (strip === null) {
        narrowLayout[narrowLayout.length - 1].failure = `${key}: no project browser in the sidebar`;
      } else if (
        strip.height < 32 ||
        strip.left < 0 ||
        strip.top < 0 ||
        strip.right > strip.innerWidth ||
        strip.bottom > strip.innerHeight
      ) {
        narrowLayout[narrowLayout.length - 1].failure =
          `${key}: browser strip ${strip.left},${strip.top} to ` +
          `${strip.right},${strip.bottom} (height ${strip.height}) leaves the ` +
          `${strip.innerWidth}x${strip.innerHeight} viewport or is under 32 px high`;
      }

      await modeButton(page, "Ingest").click();
      await page.waitForTimeout(250);
      const media = await page.evaluate(() => {
        const element = document.querySelector(".media-row__name");
        if (element === null) {
          return null;
        }
        const text = (element.textContent ?? "").trim();
        return {
          text: text.slice(0, 40),
          // A name that fits whole is not truncated, whatever its length.
          truncated: element.scrollWidth > element.clientWidth + 1,
          capacity:
            text.length === 0 || element.scrollWidth === 0
              ? 0
              : (element.clientWidth * text.length) / element.scrollWidth,
        };
      });
      narrowLayout.push({ viewport: key, check: "media name", box: media });
      if (media === null) {
        narrowLayout[narrowLayout.length - 1].failure = `${key}: no media file name row`;
      } else if (media.truncated && media.capacity < 12) {
        narrowLayout[narrowLayout.length - 1].failure =
          `${key}: media name "${media.text}" fits ` +
          `${media.capacity.toFixed(1)} characters (needs 12)`;
      }

      await modeButton(page, "Edit").click();
      await page.waitForTimeout(250);
      await page.getByPlaceholder("Find in Transcript…").fill("a");
      await page.waitForTimeout(250);
      const search = await page.evaluate(() => {
        const head = document.querySelector(".card__head");
        if (head === null) {
          return null;
        }
        const boxOf = (element) => {
          if (element === null) {
            return null;
          }
          const rect = element.getBoundingClientRect();
          return {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          };
        };
        return {
          counter: boxOf(head.querySelector(".toolbar > .muted")),
          previous: boxOf(head.querySelector("[aria-label='Previous match']")),
          next: boxOf(head.querySelector("[aria-label='Next match']")),
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
      });
      narrowLayout.push({ viewport: key, check: "search controls", box: search });
      if (search === null) {
        narrowLayout.push({
          viewport: key,
          check: "search controls",
          failure: `${key}: no transcript search head`,
        });
      } else {
        for (const name of ["counter", "previous", "next"]) {
          const box = search[name];
          if (
            box === null ||
            box.left < 0 ||
            box.top < 0 ||
            box.right > search.innerWidth ||
            box.bottom > search.innerHeight
          ) {
            narrowLayout.push({
              viewport: key,
              check: "search controls",
              failure: `${key}: search ${name} leaves the viewport`,
            });
          }
        }
      }
      await page.getByPlaceholder("Find in Transcript…").fill("");
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await modeButton(page, "Edit").click();
  await page.waitForTimeout(300);

  // Fine pointer: tabs and summaries reach 32 px, nothing falls under 24 px.
  const targetSizes = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "button, [role='tab'], summary, a[href], select, input[type='checkbox'], input[type='radio']",
      ),
    ]
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").trim().slice(0, 30),
        tab: element.matches("[role='tab'], .segmented__option, .disclosure > summary"),
        // A native checkbox or radio is small by design; its label is the target.
        height: Math.round(
          (element.matches("input[type='checkbox'], input[type='radio']")
            ? (element.closest("label") ?? element)
            : element
          ).getBoundingClientRect().height,
        ),
      }))
      .filter((target) => target.height > 0),
  );

  // Tab stops inside the transcript: every tabbable element in the listbox that
  // holds the words, plus the listbox itself. The budget is one.
  const tabStopsPerWord = await page.evaluate(() => {
    const listbox = document.querySelector("[role='listbox']:has(.transcript__word)");
    if (listbox === null) {
      return document.querySelectorAll(".transcript__word").length;
    }
    return [listbox, ...listbox.querySelectorAll("*")].filter(
      (element) =>
        element instanceof HTMLElement &&
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        element.getClientRects().length > 0,
    ).length;
  });

  await modeButton(page, "Edit").focus();
  let tabStopsBeforeFirstWord = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await page.keyboard.press("Tab");
    tabStopsBeforeFirstWord += 1;
    const onWord = await page.evaluate(() => {
      const active = document.activeElement;
      const listbox = document.querySelector("[role='listbox']:has(.transcript__word)");
      return (
        active !== null &&
        ((listbox !== null && listbox.contains(active)) ||
          active.classList.contains("transcript__word"))
      );
    });
    if (onWord) {
      break;
    }
  }

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  const focusFailures = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) {
        return null;
      }

      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").trim().slice(0, 30),
        outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
        boxShadow: style.boxShadow,
      };
    });

    if (
      info !== null &&
      info.outlineWidth < 2 &&
      (info.boxShadow === "none" || info.boxShadow === "")
    ) {
      focusFailures.push(info);
    }
  }

  const liveRegions = await page.evaluate(
    () => document.querySelectorAll('[aria-live="polite"], [role="status"]').length,
  );

  // The Studio is one full-screen overlay reached in one click from Ingest.
  const studio = {
    box: { width: 0, height: 0 },
    scrollX: 0,
    scrollY: 0,
    liveRegions: 0,
    prompterHidden: null,
  };
  const studioFailures = [];
  try {
    await modeButton(page, "Ingest").click();
    await page.getByRole("button", { name: "Record", exact: true }).click();
    const studioDialog = page.getByRole("dialog", { name: "Studio" });
    await studioDialog.waitFor({ timeout: 10000 });
    const box = await studioDialog.boundingBox();
    studio.box = { width: box?.width ?? 0, height: box?.height ?? 0 };
    studio.scrollX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    studio.scrollY = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    studio.liveRegions = await page.evaluate(
      () => document.querySelectorAll('[aria-live="polite"], [role="status"]').length,
    );
    studio.prompterHidden = await page.getByTestId("prompter-viewport").getAttribute("aria-hidden");

    if (studio.box.width < 1400 || studio.box.height < 800) {
      studioFailures.push(
        `studio: dialog is ${studio.box.width}x${studio.box.height}, not the viewport`,
      );
    }
    if (studio.scrollX !== 0 || studio.scrollY !== 0) {
      studioFailures.push(`studio: page scroll ${studio.scrollX}/${studio.scrollY}`);
    }
    if (studio.liveRegions !== 1) {
      studioFailures.push(`studio: ${studio.liveRegions} live regions`);
    }
    if (studio.prompterHidden !== "true") {
      studioFailures.push("studio: prompter is not aria-hidden");
    }

    await studioDialog.getByRole("button", { name: "Close", exact: true }).click();
    await studioDialog.waitFor({ state: "detached" });
  } catch (error) {
    studioFailures.push(`studio: ${error instanceof Error ? error.message : String(error)}`);
  }

  const headingViolations = [];
  const seenModes = new Set(headings.map((heading) => heading.mode));
  for (const mode of seenModes) {
    const modeHeadings = headings.filter((heading) => heading.mode === mode);
    if (!modeHeadings.some((heading) => heading.level === 1)) {
      headingViolations.push(`${mode}: no h1`);
    }

    let previous = 0;
    for (const heading of modeHeadings) {
      if (previous !== 0 && heading.level > previous + 1) {
        headingViolations.push(`${mode}: h${previous} to h${heading.level} (${heading.text})`);
      }
      previous = heading.level;
    }
  }

  const unique = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const targets = {
    checked: targetSizes.length,
    under44: targetSizes.filter((target) => target.height < 44).length,
    under24: targetSizes.filter((target) => target.height < 24),
    tabsOrSummariesUnder32: targetSizes.filter((target) => target.tab && target.height < 32),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    steps: {
      editableTranscript: { clicks: counts.clicks, keys: counts.keys },
    },
    viewports,
    transcript: { tabStopsBeforeFirstWord, tabStopsPerWord },
    targets,
    liveRegions,
    studio,
    accessibleNames: {
      nameless: unique(nameless),
    },
    focusOutlines: {
      checked: 12,
      failures: focusFailures,
    },
    headings: {
      order: unique(headings),
      violations: [...new Set(headingViolations)],
    },
    disabledPrimary: unique(disabledPrimary),
    exportVisibility,
    narrowLayout,
    pageErrors,
  };

  const cssSource = await readFile(path.join("apps", "web", "styles", "globals.css"), "utf8");
  const token = (name) =>
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(cssSource)?.[1] ?? "";
  const fillOf = (selector) =>
    new RegExp(`${selector}\\s*\\{[^}]*background:\\s*var\\(--([\\w-]+)\\)`).exec(cssSource)?.[1] ??
    "";
  const contrastPairs = [
    ["removed word", token("text-secondary"), token("card")],
    ["active word", token("on-primary"), token("primary-focus")],
    ["filled primary", token("on-primary"), token(fillOf("\\.button--primary"))],
    [
      "filled primary hover",
      token("on-primary"),
      token(fillOf("\\.button--primary:hover:enabled")),
    ],
    ["error on surface", token("error"), token("surface")],
    ["error on error-surface", token("error"), token("error-surface")],
    ["tertiary on card", token("text-tertiary"), token("card")],
  ];
  report.contrast = contrastPairs.map(([name, foreground, background]) => {
    const ratio =
      foreground !== "" && background !== "" ? contrastRatio(foreground, background) : 0;
    return {
      name,
      foreground,
      background,
      ratio: Number(ratio.toFixed(2)),
      pass: ratio >= 4.5,
    };
  });

  const reportPath = path.join("tools", "e2e", "ux-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const budgets = JSON.parse(await readFile(path.join("tools", "e2e", "ux-budgets.json"), "utf8"));
  const failures = [
    ...checkBudgets(report, budgets).map((violation) => violation.message),
    ...report.accessibleNames.nameless.map(
      (item) => `${item.mode}: ${item.tag} "${item.text}" has no accessible name`,
    ),
    ...focusFailures.map((item) => `${item.tag} "${item.text}" has no visible focus outline`),
    ...report.headings.violations,
    ...report.disabledPrimary.map(
      (item) => `${item.mode}: disabled "${item.text}" still has an indigo background`,
    ),
    ...exportVisibility.filter((item) => item.failure !== undefined).map((item) => item.failure),
    ...narrowLayout.filter((item) => item.failure !== undefined).map((item) => item.failure),
    ...report.contrast
      .filter((pair) => !pair.pass)
      .map((pair) => `contrast: ${pair.name} is ${pair.ratio}:1 (needs 4.5)`),
    ...targets.under24.map(
      (target) => `target: ${target.tag} "${target.text}" is ${target.height} px high (needs 24)`,
    ),
    ...targets.tabsOrSummariesUnder32.map(
      (target) => `target: ${target.tag} "${target.text}" is ${target.height} px high (needs 32)`,
    ),
    ...studioFailures,
    ...pageErrors,
  ];

  console.log(
    `ux gate: clicks ${counts.clicks}, tab stops ${tabStopsBeforeFirstWord}, ` +
      `per word ${tabStopsPerWord}, live regions ${liveRegions}`,
  );
  console.log(
    `  targets (Edit, 1440x900, fine pointer): ${targets.under44} of ${targets.checked} under 44 px`,
  );
  for (const [viewport, metrics] of Object.entries(viewports)) {
    console.log(
      `  ${viewport}: scroll ${metrics.pageScrollX}/${metrics.pageScrollY}, ` +
        `transcript lines ${metrics.transcriptLines}`,
    );
  }

  if (failures.length > 0) {
    console.error(`ux gate: ${failures.length} failure(s)`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("ux gate: PASS");
  }
  console.log(`report: ${reportPath}`);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  if (serverLog.length > 0) {
    console.error("--- server log ---");
    console.error(serverLog.join(""));
  }
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => undefined);
  server.kill("SIGTERM");
  await new Promise((resolve) => asr.close(resolve));
}
