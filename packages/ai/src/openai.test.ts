import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createWhisperProvider, type FetchLike } from "./openai";

const SCRATCH_PREFIX = path.join(os.tmpdir(), "verbal-asr-");
const MEDIA = path.join(path.sep, "media", "take.mp4");

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function word(text: string, start: number, end: number) {
  return { word: text, start, end };
}

function scratchDirFrom(run: ReturnType<typeof vi.fn>): string {
  const args = run.mock.calls[0]?.[1] as string[] | undefined;
  return path.dirname(String(args?.at(-1)));
}

describe("createWhisperProvider uploads extracted audio", () => {
  it("uploads the audio file, never the video bytes", async () => {
    const readPaths: string[] = [];
    const readFile = vi.fn(async (filePath: string) => {
      readPaths.push(filePath);
      return new Uint8Array([9, 9, 9]);
    });
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const stat = vi.fn(async () => ({ size: 100 }));
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        text: "hello",
        language: "en",
        words: [word("hello", 0, 0.4)],
      });
    };

    const provider = createWhisperProvider({
      apiKey: "secret",
      fetch,
      readFile,
      run,
      stat,
    });

    const result = await provider.transcribe({ filePath: MEDIA });

    expect(readPaths).not.toContain(MEDIA);
    expect(readPaths.some((p) => p.endsWith(".mp3"))).toBe(true);

    const form = calls[0]?.init?.body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe("take.mp3");
    expect(form.get("model")).toBe("whisper-1");
    expect(result.words).toEqual([{ text: "hello", start: 0, end: 0.4 }]);
  });

  it("splits audio over the limit and offsets the second chunk's words", async () => {
    const seeks: number[] = [];
    const run = vi.fn(async (binary: string, args: readonly string[]) => {
      if (binary === "ffmpeg") {
        const ssIndex = args.indexOf("-ss");
        if (ssIndex !== -1) {
          seeks.push(Number(args[ssIndex + 1]));
        }
      }
      return { stdout: "", stderr: "" };
    });

    const payloads = [
      { text: "hello", language: "en", words: [word("hello", 0.1, 0.5)] },
      { text: "world", language: "en", words: [word("world", 0.2, 0.6)] },
    ];
    let callIndex = 0;
    const fetch: FetchLike = async () => {
      const payload = payloads[callIndex];
      callIndex += 1;
      return jsonResponse(payload);
    };

    const provider = createWhisperProvider({
      apiKey: "k",
      fetch,
      readFile: async () => new Uint8Array([1]),
      run,
      stat: async () => ({ size: 8000 }),
      maxUploadBytes: 4000,
    });

    const result = await provider.transcribe({ filePath: path.join(path.sep, "media", "long.mp4") });

    expect(seeks).toHaveLength(2);
    expect(seeks[0]).toBe(0);
    const secondOffset = seeks[1]!;
    expect(secondOffset).toBeGreaterThan(0);

    expect(result.words).toEqual([
      { text: "hello", start: 0.1, end: 0.5 },
      { text: "world", start: secondOffset + 0.2, end: secondOffset + 0.6 },
    ]);
    expect(result.text).toBe("hello world");
  });

  it("never reads the whole video file", async () => {
    const readPaths: string[] = [];
    const readFile = vi.fn(async (filePath: string) => {
      readPaths.push(filePath);
      return new Uint8Array([1]);
    });
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const stat = vi.fn(async () => ({ size: 100 }));
    const fetch: FetchLike = async () =>
      jsonResponse({ text: "", words: [] });

    const provider = createWhisperProvider({
      apiKey: "k",
      fetch,
      readFile,
      run,
      stat,
    });

    await provider.transcribe({ filePath: path.join(path.sep, "media", "big.mp4") });

    expect(readPaths).not.toContain(path.join(path.sep, "media", "big.mp4"));
    expect(readPaths.length).toBeGreaterThan(0);
    expect(readPaths.every((p) => p.endsWith(".mp3"))).toBe(true);
  });

  it("removes the private scratch directory after success", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const provider = createWhisperProvider({
      apiKey: "k",
      fetch: async () => jsonResponse({ text: "", words: [] }),
      readFile: async () => new Uint8Array([1]),
      run,
      stat: async () => ({ size: 100 }),
    });

    await provider.transcribe({ filePath: MEDIA });

    const dir = scratchDirFrom(run);
    expect(dir.startsWith(SCRATCH_PREFIX)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it("removes the private scratch directory after a failure", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const provider = createWhisperProvider({
      apiKey: "bad",
      fetch: async () => jsonResponse({ error: "nope" }, 401),
      readFile: async () => new Uint8Array([1]),
      run,
      stat: async () => ({ size: 100 }),
    });

    await expect(provider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
      code: "request-failed",
      status: 401,
    });

    const dir = scratchDirFrom(run);
    expect(dir.startsWith(SCRATCH_PREFIX)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it("honours the abort signal between chunks", async () => {
    const controller = new AbortController();
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      controller.abort();
      return jsonResponse({ text: "a", words: [word("a", 0, 0.1)] });
    };

    const provider = createWhisperProvider({
      apiKey: "k",
      fetch,
      readFile: async () => new Uint8Array([1]),
      run,
      stat: async () => ({ size: 8000 }),
      maxUploadBytes: 4000,
    });

    await expect(
      provider.transcribe({ filePath: MEDIA }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "request-failed", message: "transcription cancelled" });

    expect(calls).toBe(1);
  });

  it("maps a missing ffmpeg binary to not-configured", async () => {
    const missing = Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    const provider = createWhisperProvider({
      apiKey: "k",
      fetch: async () => jsonResponse({ text: "", words: [] }),
      readFile: async () => new Uint8Array([1]),
      run: async () => Promise.reject(missing),
      stat: async () => ({ size: 100 }),
    });

    await expect(provider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
      code: "not-configured",
    });
  });

  it("rejects a response without words", async () => {
    const provider = createWhisperProvider({
      apiKey: "k",
      fetch: async () => jsonResponse({ text: "hello" }),
      readFile: async () => new Uint8Array([1]),
      run: async () => ({ stdout: "", stderr: "" }),
      stat: async () => ({ size: 100 }),
    });

    await expect(provider.transcribe({ filePath: MEDIA })).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});
