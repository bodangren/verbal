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

async function download(file, target, base) {
  const url = `${base}/${REPO}/resolve/main/${file.remote}`;
  const part = `${target}.part`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || response.body === null) {
    throw new Error(`${url} answered ${response.status}`);
  }

  const total = Number(response.headers.get("content-length")) || file.bytes;
  let received = 0;
  let lastPercent = -1;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      const percent = Math.min(100, Math.floor((received / total) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        process.stderr.write(`\r  ${file.local}: ${percent}%   `);
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(part));
    process.stderr.write("\n");

    const reason = await verify(part, file);
    if (reason !== null) {
      throw new Error(`${file.local} failed verification: ${reason}`);
    }
    await rename(part, target);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dir = path.resolve(options.dir ?? defaultDir());
  const base = baseUrl();

  await mkdir(dir, { recursive: true });
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

main().catch((error) => {
  console.error(`fetch-typhoon-model failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
