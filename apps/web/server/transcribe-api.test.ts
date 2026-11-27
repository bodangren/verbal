import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JobRegistry, createMemoryJobStore, parseTranscript, projectPaths } from "@verbal/core";
import handler from "../pages/api/transcribe";
import { setJobRegistry } from "./registry";

const WORDS = [
  { word: "so", start: 0, end: 0.3 },
  { word: "um", start: 0.4, end: 0.6 },
  { word: "today", start: 0.7, end: 1.2 },
];

/** A valid mono 16 kHz 16-bit WAV of silence, so ffmpeg can read it. */
function silentWav(seconds: number): Buffer {
  const rate = 16000;
  const samples = Math.round(rate * seconds);
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A stand-in for the OpenAI audio endpoint: it answers with verbose_json words. */
function startFakeAsr(): Promise<{ server: Server; baseUrl: string; calls: string[] }> {
  const calls: string[] = [];

  const server = createServer((request, response) => {
    calls.push(request.url ?? "");

    if (request.method !== "POST" || request.url !== "/v1/audio/transcriptions") {
      response.statusCode = 404;
      response.end("{}");
      return;
    }

    // Drain the multipart body before answering, as a real server would.
    request.resume();
    request.on("end", () => {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          text: WORDS.map((word) => word.word).join(" "),
          language: "en",
          words: WORDS,
        }),
      );
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}/v1`, calls });
    });
  });
}

async function waitForJob(registry: JobRegistry, id: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const record = registry.get(id);
    if (record !== undefined && record.status !== "queued" && record.status !== "running") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

describe("POST /api/transcribe", () => {
  let root = "";
  let app: Server;
  let base = "";
  let fake: Awaited<ReturnType<typeof startFakeAsr>>;
  let registry: JobRegistry;

  const savedKey = process.env.OPENAI_API_KEY;
  const savedBaseUrl = process.env.OPENAI_BASE_URL;
  const savedAsr = process.env.VERBAL_ASR;

  beforeAll(async () => {
    fake = await startFakeAsr();

    root = await mkdtemp(path.join(tmpdir(), "verbal-transcribe-"));
    await mkdir(path.join(root, "assets"), { recursive: true });
    // The provider extracts audio with ffmpeg, so the media must be real audio.
    await writeFile(path.join(root, "assets", "take.webm"), silentWav(0.2));
    await writeFile(
      path.join(root, "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "p1",
        name: "Transcribe",
        createdAt: "2026-11-21T00:00:00.000Z",
        media: { assetPath: "assets/take.webm" },
      }),
    );

    app = createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
    const address = app.address() as AddressInfo;
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await new Promise<void>((resolve) => fake.server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
    process.env.OPENAI_API_KEY = savedKey;
    process.env.OPENAI_BASE_URL = savedBaseUrl;
    if (savedAsr === undefined) {
      delete process.env.VERBAL_ASR;
    } else {
      process.env.VERBAL_ASR = savedAsr;
    }
    setJobRegistry(undefined);
  });

  beforeEach(async () => {
    registry = await JobRegistry.open(createMemoryJobStore());
    setJobRegistry(registry);
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = fake.baseUrl;
    process.env.VERBAL_ASR = "cloud";
  });

  afterEach(() => {
    setJobRegistry(undefined);
  });

  it("transcribes through the provider and stores the words", async () => {
    const response = await fetch(`${base}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectRoot: root }),
    });

    expect(response.status).toBe(202);
    const job = (await response.json()) as { id: string };
    await waitForJob(registry, job.id);

    expect(registry.get(job.id)?.status).toBe("done");
    expect(fake.calls).toContain("/v1/audio/transcriptions");

    const stored = parseTranscript(await readFile(projectPaths(root).transcript, "utf8"));
    expect(stored.words.map((word) => word.text)).toEqual(["so", "um", "today"]);
    expect(stored.removedWordIds).toEqual([]);
  });

  it("returns 503 and names the missing key when the server has none", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await fetch(`${base}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectRoot: root }),
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("OPENAI_API_KEY");
  });

  it("rejects a project without media and a non-POST method", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "verbal-transcribe-empty-"));
    await writeFile(
      path.join(empty, "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "p2",
        name: "Empty",
        createdAt: "2026-11-21T00:00:00.000Z",
      }),
    );

    const noMedia = await fetch(`${base}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectRoot: empty }),
    });
    expect(noMedia.status).toBe(400);

    const get = await fetch(`${base}/api/transcribe`);
    expect(get.status).toBe(405);

    await rm(empty, { recursive: true, force: true });
  });
});
