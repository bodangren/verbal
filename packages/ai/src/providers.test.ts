import { describe, expect, it } from "vitest";
import {
  AiError,
  createChatProvider,
  createWhisperProvider,
  type FetchLike,
  type LlmProvider,
  type TranscriptionProvider,
} from "./index";

function fakeFetch(payload: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];

  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };

  return { fn, calls };
}

describe("provider contract", () => {
  it("accepts any implementation of the interfaces", async () => {
    const asr: TranscriptionProvider = {
      id: "fake-asr",
      async transcribe() {
        return { text: "hello", language: "en", words: [{ text: "hello", start: 0, end: 0.4 }] };
      },
    };
    const llm: LlmProvider = {
      id: "fake-llm",
      async complete() {
        return { text: "done", model: "fake" };
      },
    };

    await expect(asr.transcribe({ filePath: "/media/a.mp4" })).resolves.toMatchObject({
      text: "hello",
    });
    await expect(llm.complete({ prompt: "hi" })).resolves.toMatchObject({ text: "done" });
  });
});

describe("createWhisperProvider", () => {
  it("refuses to construct without an API key", () => {
    expect(() => createWhisperProvider({ apiKey: "  " })).toThrow(AiError);
  });

  it("posts the file and asks for word timestamps", async () => {
    const response = fakeFetch({
      text: "hello world",
      language: "en",
      words: [
        { word: "hello", start: 0, end: 0.4 },
        { word: "world", start: 0.45, end: 0.9 },
      ],
    });
    const provider = createWhisperProvider({
      apiKey: "secret",
      fetch: response.fn,
      readFile: async () => new Uint8Array([1, 2, 3]),
    });

    const result = await provider.transcribe({ filePath: "/media/take.mp4" });

    const call = response.calls[0];
    expect(call?.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(call?.init?.method).toBe("POST");

    const headers = new Headers(call?.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer secret");

    const form = call?.init?.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("timestamp_granularities[]")).toBe("word");

    expect(result).toEqual({
      text: "hello world",
      language: "en",
      words: [
        { text: "hello", start: 0, end: 0.4 },
        { text: "world", start: 0.45, end: 0.9 },
      ],
    });
  });

  it("honours a custom base URL and model", async () => {
    const response = fakeFetch({ text: "", words: [] });
    const provider = createWhisperProvider({
      apiKey: "k",
      baseUrl: "http://localhost:8080/v1/",
      model: "whisper-large",
      fetch: response.fn,
      readFile: async () => new Uint8Array(),
    });

    await provider.transcribe({ filePath: "/a.mp4" });

    expect(response.calls[0]?.url).toBe("http://localhost:8080/v1/audio/transcriptions");
    expect((response.calls[0]?.init?.body as FormData).get("model")).toBe("whisper-large");
  });

  it("surfaces an HTTP failure with its status", async () => {
    const response = fakeFetch({ error: "nope" }, 401);
    const provider = createWhisperProvider({
      apiKey: "bad",
      fetch: response.fn,
      readFile: async () => new Uint8Array(),
    });

    await expect(provider.transcribe({ filePath: "/a.mp4" })).rejects.toMatchObject({
      code: "request-failed",
      status: 401,
    });
  });

  it("rejects a response without words", async () => {
    const response = fakeFetch({ text: "hello" });
    const provider = createWhisperProvider({
      apiKey: "k",
      fetch: response.fn,
      readFile: async () => new Uint8Array(),
    });

    await expect(provider.transcribe({ filePath: "/a.mp4" })).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});

describe("createChatProvider", () => {
  it("sends a chat completion with an optional system prompt", async () => {
    const response = fakeFetch({
      model: "test-model-2026",
      choices: [{ message: { content: "cleaned" } }],
    });
    const provider = createChatProvider({ apiKey: "secret", fetch: response.fn });

    const result = await provider.complete({
      system: "You clean transcripts.",
      prompt: "Remove the filler words.",
      temperature: 0.2,
    });

    const call = response.calls[0];
    expect(call?.url).toBe("https://api.openai.com/v1/chat/completions");

    const body = JSON.parse(String(call?.init?.body)) as {
      model: string;
      temperature: number;
      messages: { role: string; content: string }[];
    };
    expect(body.messages).toEqual([
      { role: "system", content: "You clean transcripts." },
      { role: "user", content: "Remove the filler words." },
    ]);
    expect(body.temperature).toBe(0.2);
    expect(result).toEqual({ text: "cleaned", model: "test-model-2026" });
  });

  it("rejects a malformed completion", async () => {
    const response = fakeFetch({ choices: [] });
    const provider = createChatProvider({ apiKey: "k", fetch: response.fn });

    await expect(provider.complete({ prompt: "hi" })).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});
