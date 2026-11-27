import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtemp, rm, stat as statFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeMediaRevision, createProject, nodeFileSystem, openProject } from "@verbal/core";

const { runAssemblyJob, getJobRegistry, readTakeTranscript } = vi.hoisted(() => ({
  runAssemblyJob: vi.fn(),
  getJobRegistry: vi.fn(),
  readTakeTranscript: vi.fn(),
}));

vi.mock("./assembly-job", () => ({ runAssemblyJob }));
vi.mock("./registry", () => ({ getJobRegistry }));
vi.mock("./take-transcript", () => ({ readTakeTranscript }));
vi.mock("./script-api", () => ({
  createScriptApi: () => ({ read: async () => "Hello world. This is a test." }),
}));
vi.mock("./capture-spawn", () => ({ spawnCapture: vi.fn() }));

import handler from "../pages/api/assembly";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
  vi.clearAllMocks();
});

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-assembly-route-"));
  roots.push(root);
  await createProject(nodeFileSystem, root, { name: "Demo", id: "p1" });
  getJobRegistry.mockResolvedValue({ create: async () => ({ id: "job-1" }) });
  readTakeTranscript.mockResolvedValue({
    words: [
      { text: "hello", start: 0, end: 0.5 },
      { text: "world", start: 0.5, end: 1 },
      { text: "this", start: 1.5, end: 2 },
      { text: "is", start: 2, end: 2.5 },
      { text: "a", start: 2.5, end: 2.8 },
      { text: "test", start: 2.8, end: 3.2 },
    ],
  });
  runAssemblyJob.mockImplementation(
    async (
      _deps: unknown,
      input: { outputPath: string; onOutput?: (outputPath: string) => Promise<void> },
    ) => {
      await writeFile(input.outputPath, "cut");
      await input.onOutput?.(input.outputPath);
    },
  );
  return { root };
}

function request(body: unknown): IncomingMessage {
  const request = new EventEmitter() as IncomingMessage;
  request.method = "POST";
  request.headers = {};
  (request as unknown as AsyncIterable<Buffer>)[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(JSON.stringify(body));
  };
  return request;
}

function response(): ServerResponse & { statusCode?: number; body?: unknown } {
  const result: {
    statusCode?: number;
    body?: unknown;
    writeHead(status: number): unknown;
    setHeader(): unknown;
    end(body: string): void;
  } = {
    writeHead(status: number) {
      result.statusCode = status;
      return result;
    },
    setHeader() {
      return result;
    },
    end(body: string) {
      result.body = JSON.parse(body);
    },
  };
  return result as unknown as ServerResponse & { statusCode?: number; body?: unknown };
}

describe("POST /api/assembly media replacement", () => {
  it("writes a fresh revision when the assembled cut becomes the project media", async () => {
    const { root } = await setup();
    const res = response();

    await handler(request({ root, takeId: "take-1", render: true }), res);

    expect(res.statusCode).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const project = await openProject(nodeFileSystem, root);
    expect(project.media?.assetPath).toBe("assets/assembled-job-1.mp4");

    const mediaPath = path.join(root, "assets", "assembled-job-1.mp4");
    const info = await statFile(mediaPath);
    const expected = await computeMediaRevision({
      mediaPath,
      stat: async () => ({ size: info.size, mtimeMs: info.mtimeMs }),
    });
    expect(project.media?.mediaRevision).toBe(expected);
  });
});
