import { describe, expect, it } from "vitest";
import {
  AiError,
  createOpenAiImageProvider,
  type FetchLike,
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

describe("createOpenAiImageProvider", () => {
  it("refuses to construct without a key", () => {
    expect(() => createOpenAiImageProvider({ apiKey: "" })).toThrow(AiError);
  });

  it("estimates the configured cost", () => {
    const provider = createOpenAiImageProvider({ apiKey: "k", costPerImage: 0.1 });

    expect(provider.estimateCost({ prompt: "a diagram" })).toBe(0.1);
  });

  it("defaults the estimate to a documented price", () => {
    expect(createOpenAiImageProvider({ apiKey: "k" }).estimateCost({ prompt: "x" })).toBe(0.04);
  });

  it("posts the prompt and decodes base64 image bytes", async () => {
    const bytes = Buffer.from([1, 2, 3, 4]);
    const response = fakeFetch({ data: [{ b64_json: bytes.toString("base64") }] });
    const provider = createOpenAiImageProvider({ apiKey: "secret", fetch: response.fn });

    const image = await provider.generate({ prompt: "a diagram", width: 512, height: 512 });

    const call = response.calls[0];
    expect(call?.url).toBe("https://api.openai.com/v1/images/generations");
    const body = JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      prompt: "a diagram",
      n: 1,
      size: "512x512",
      response_format: "b64_json",
    });

    expect(image.mediaType).toBe("image/png");
    expect(image.prompt).toBe("a diagram");
    expect(Array.from(image.data)).toEqual([1, 2, 3, 4]);
  });

  it("surfaces an HTTP failure", async () => {
    const response = fakeFetch({ error: "nope" }, 500);
    const provider = createOpenAiImageProvider({ apiKey: "k", fetch: response.fn });

    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({
      code: "request-failed",
      status: 500,
    });
  });

  it("rejects an empty prompt before calling the API", async () => {
    const response = fakeFetch({ data: [] });
    const provider = createOpenAiImageProvider({ apiKey: "k", fetch: response.fn });

    await expect(provider.generate({ prompt: "  " })).rejects.toMatchObject({
      code: "invalid-request",
    });
    expect(response.calls).toHaveLength(0);
  });

  it("rejects a response without image data", async () => {
    const response = fakeFetch({ data: [] });
    const provider = createOpenAiImageProvider({ apiKey: "k", fetch: response.fn });

    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it("generates nothing during an estimate", () => {
    const response = fakeFetch({ data: [] });
    const provider = createOpenAiImageProvider({ apiKey: "k", fetch: response.fn });

    provider.estimateCost({ prompt: "x" });

    expect(response.calls).toHaveLength(0);
  });
});
