import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TranscriptionProvider } from "@verbal/ai";
import { nodeFileSystem } from "@verbal/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseTakeTranscript,
  readTakeTranscript,
  saveTakeTranscript,
  transcribeTake,
} from "./take-transcript";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-take-transcript-"));
  roots.push(root);
  return root;
}

const words = [{ text: "hello", start: 0, end: 0.5 }];

describe("take transcript", () => {
  it("round-trips words", async () => {
    const root = await tempRoot();

    await saveTakeTranscript(nodeFileSystem, root, "take-1", words);

    expect(await readTakeTranscript(nodeFileSystem, root, "take-1")).toEqual({ words });
    expect(await readTakeTranscript(nodeFileSystem, root, "missing")).toBeNull();
  });

  it("drops malformed words on parse", () => {
    expect(
      parseTakeTranscript(JSON.stringify({ words: [words[0], { text: "x" }] })),
    ).toEqual({ words });
    expect(parseTakeTranscript("not json")).toBeNull();
    expect(parseTakeTranscript(JSON.stringify({ nope: [] }))).toBeNull();
  });

  it("transcribes the take file and saves the words", async () => {
    const root = await tempRoot();
    const paths: string[] = [];
    const provider = {
      id: "fake",
      transcribe: async (request: { filePath: string }) => {
        paths.push(request.filePath);
        return { text: "hello", language: "en", words };
      },
    } as unknown as TranscriptionProvider;

    const result = await transcribeTake(
      { fs: nodeFileSystem, provider },
      { root, takeId: "take-1" },
    );

    expect(paths).toEqual([path.join(root, "takes", "take-1.mp4")]);
    expect(result).toEqual({ words });
    expect(await readTakeTranscript(nodeFileSystem, root, "take-1")).toEqual({ words });
  });
});
