#!/usr/bin/env node
/**
 * Downloads the Typhoon ASR Realtime ONNX model used by the local Thai engine.
 *
 * The three files are pinned by size and SHA-256. They come from a Hugging Face
 * repo; set VERBAL_HF_MIRROR=https://hf-mirror.com when huggingface.co is
 * unreachable. Nothing here is bundled with the app or with git.
 *
 *   node tools/fetch-typhoon-model.mjs             # into the app data dir
 *   node tools/fetch-typhoon-model.mjs --dir PATH  # somewhere else
 *   node tools/fetch-typhoon-model.mjs --check     # verify only, no download
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

const REPO = "wannaphong/typhoon-asr-realtime-onnx";
const LICENSE = "CC-BY-4.0 — Typhoon ASR Realtime, SCB 10X (https://opentyphoon.ai)";

// Upstream file names are misleading: the export says "quran-ar" but the model
// and vocabulary are the Thai Typhoon model (the vocab is Thai sub-word BPE).
const FILES = [
  {
    remote: "encoder-fastconformer-quran-ar.onnx",
    local: "encoder.onnx",
    bytes: 456050599,
    sha256: "9573e8224cbad1be622b779e780cccc5638a4dd19097fd6c7258d8ec1c21cf91",
  },
  {
    remote: "decoder_joint-fastconformer-quran-ar.onnx",
    local: "decoder.onnx",
    bytes: 26584368,
    sha256: "c445e567e1133506c1ff5e4722ee61b8adf830243e0449de3b796a3205ea1e4a",
  },
  {
    remote: "tokenizer/vocab.json",
    local: "vocab.json",
    bytes: 36196,
    sha256: "a7277aeb7b08f6c8a1ed7838b55d204cf6766dbe583d690bbb9fb0d42de0c2b1",
  },
];

function parseArgs(argv) {
  const options = { dir: undefined, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--check") {
      options.check = true;
    } else if (value === "--dir") {
      i += 1;
      options.dir = argv[i];
    } else if (value === "--help" || value === "-h") {
      console.log("usage: node tools/fetch-typhoon-model.mjs [--dir PATH] [--check]");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  return options;
}

function defaultDir() {
  const configured = process.env.VERBAL_TYPHOON_MODEL?.trim();
  if (configured) {
    return configured;
  }
  const xdg = process.env.XDG_DATA_HOME?.trim();
  const dataRoot = xdg && xdg !== "" ? xdg : path.join(os.homedir(), ".local", "share");
  return path.join(dataRoot, "verbal", "models", "typhoon-asr-realtime");
}

function baseUrl() {
  return (process.env.VERBAL_HF_MIRROR?.trim() || "https://huggingface.co").replace(/\/+$/, "");
}

async function sha256(file) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/** Returns null when the file is complete, otherwise a human-readable reason. */
async function verify(target, expected) {
  let info;
  try {
    info = await stat(target);
  } catch (error) {
    return error?.code === "ENOENT" ? "missing" : String(error);
  }
  if (info.size !== expected.bytes) {
    return `size ${info.size} != ${expected.bytes}`;
  }
  const digest = await sha256(target);
  return digest === expected.sha256 ? null : `sha256 ${digest} != ${expected.sha256}`;
}

const INACTIVITY_MS = 60_000;

export async function download(file, target, base, options = {}) {
  const url = `${base}/${REPO}/resolve/main/${file.remote}`;
  const part = `${target}.part`;
  const inactivityMs = options.inactivityMs ?? INACTIVITY_MS;
  const mirrorHint =
    "If huggingface.co is blocked or slow, retry with VERBAL_HF_MIRROR=https://hf-mirror.com";

  let partSize = 0;
  try {
    partSize = (await stat(part)).size;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, inactivityMs);
  };
  const stalled = () =>
    new Error(`inactivity timeout: no bytes from ${url} for ${inactivityMs} ms. ${mirrorHint}`);
  const unreachable = (error) => {
    if (timedOut) {
      return stalled();
    }
    const reason = error instanceof Error ? error.message : String(error);
    return new Error(`cannot reach ${url}: ${reason}. ${mirrorHint}`);
  };

  let resume = partSize > 0;
  arm();
  try {
    let response;
    try {
      response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        ...(resume ? { headers: { Range: `bytes=${partSize}-` } } : {}),
      });
    } catch (error) {
      throw unreachable(error);
    }

    if (response.status === 416 && resume) {
      const reason = await verify(part, file);
      if (reason === null) {
        await rename(part, target);
        return;
      }
      resume = false;
      partSize = 0;
      arm();
      try {
        response = await fetch(url, { redirect: "follow", signal: controller.signal });
      } catch (error) {
        throw unreachable(error);
      }
    }

    if (!response.ok || response.body === null) {
      throw new Error(`${url} answered ${response.status}. ${mirrorHint}`);
    }
    if (resume && response.status !== 206) {
      resume = false;
      partSize = 0;
    }

    let received = partSize;
    let lastPercent = -1;
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        arm();
        received += chunk.length;
        const percent = Math.min(100, Math.floor((received / file.bytes) * 100));
        if (percent !== lastPercent) {
          lastPercent = percent;
          process.stderr.write(`\r  ${file.local}: ${percent}%   `);
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        Readable.fromWeb(response.body),
        progress,
        createWriteStream(part, { flags: resume ? "a" : "w" }),
      );
    } catch (error) {
      if (timedOut) {
        throw stalled();
      }
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }

  process.stderr.write("\n");
  const reason = await verify(part, file);
  if (reason !== null) {
    if (reason.startsWith("size ")) {
      throw new Error(
        `${file.local} failed verification: ${reason}; keeping ${path.basename(part)}`,
      );
    }
    await rm(part, { force: true });
    throw new Error(`${file.local} failed verification: ${reason}`);
  }
  await rename(part, target);
}

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `cannot create ${dir}: ${reason}`,
        "Choose a writable data root. The app reads XDG_DATA_HOME too:",
        `  XDG_DATA_HOME=/path/to/writable/share npm run fetch:typhoon`,
        "or download somewhere else and point the app there:",
        "  node tools/fetch-typhoon-model.mjs --dir /path/to/model",
        "  VERBAL_TYPHOON_MODEL=/path/to/model npm run dev",
      ].join("\n"),
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dir = path.resolve(options.dir ?? defaultDir());
  const base = baseUrl();

  await ensureDir(dir);
  console.log(`Typhoon ASR model directory: ${dir}`);

  for (const file of FILES) {
    const target = path.join(dir, file.local);
    const reason = await verify(target, file);

    if (reason === null) {
      console.log(`  ${file.local}: ok`);
      continue;
    }
    if (options.check) {
      throw new Error(`${file.local}: ${reason}; re-run without --check to download`);
    }

    console.log(`  ${file.local}: ${reason}; downloading`);
    await download(file, target, base);
    console.log(`  ${file.local}: ok`);
  }

  console.log(`Ready. ${LICENSE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`fetch-typhoon-model failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
