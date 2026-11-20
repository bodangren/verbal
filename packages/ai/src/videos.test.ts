import { describe, expect, it } from "vitest";
import { AiError, createOpenAiVideoProvider, type FetchLike } from "./index";

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

describe("createOpenAiVideoProvider", () => {
  it("refuses to construct without a key", () => {
    expect(() => createOpenAiVideoProvider({ apiKey: "" })).toThrow(AiError);
  });

  it("estimates by duration with a minimum charge", () => {
    const provider = createOpenAiVideoProvider({
      apiKey: "k",
      costPerSecond: 0.1,
      minimumCost: 0.25,
    });

    expect(provider.estimateCost({ prompt: "x", durationSeconds: 4 })).toBe(0.4);
    expect(provider.estimateCost({ prompt: "x", durationSeconds: 1 })).toBe(0.25);
  });

  it("posts the prompt and decodes base64 video bytes", async () => {
    const bytes = Buffer.from([5, 6, 7]);
    const response = fakeFetch({ data: [{ b64_json: bytes.toString("base64") }] });
    const provider = createOpenAiVideoProvider({ apiKey: "secret", fetch: response.fn });

    const clip = await provider.generate({
      prompt: "a rotating diagram",
      durationSeconds: 4,
      width: 320,
      height: 180,
    });

    const body = JSON.parse(String(response.calls[0]?.init?.body)) as Record<string, unknown>;
    expect(response.calls[0]?.url).toContain("/videos/generations");
    expect(body).toMatchObject({
      prompt: "a rotating diagram",
      duration: 4,
      size: "320x180",
    });
    expect(clip.mediaType).toBe("video/mp4");
    expect(Array.from(clip.data)).toEqual([5, 6, 7]);
  });

  it("rejects a duration outside 1..60 before calling the API", async () => {
    const response = fakeFetch({ data: [] });
    const provider = createOpenAiVideoProvider({ apiKey: "k", fetch: response.fn });

    await expect(provider.generate({ prompt: "x", durationSeconds: 0 })).rejects.toMatchObject({
      code: "invalid-request",
    });
    expect(response.calls).toHaveLength(0);
  });

  it("rejects an empty prompt", async () => {
    const response = fakeFetch({ data: [] });
    const provider = createOpenAiVideoProvider({ apiKey: "k", fetch: response.fn });

    await expect(provider.generate({ prompt: " ", durationSeconds: 4 })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  it("surfaces an HTTP failure", async () => {
    const response = fakeFetch({ error: "nope" }, 429);
    const provider = createOpenAiVideoProvider({ apiKey: "k", fetch: response.fn });

    await expect(
      provider.generate({ prompt: "x", durationSeconds: 4 }),
    ).rejects.toMatchObject({ code: "request-failed", status: 429 });
  });

  it("rejects a response without clip data", async () => {
    const response = fakeFetch({ data: [] });
    const provider = createOpenAiVideoProvider({ apiKey: "k", fetch: response.fn });

    await expect(
      provider.generate({ prompt: "x", durationSeconds: 4 }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });
});
