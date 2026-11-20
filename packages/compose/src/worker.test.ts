import { describe, expect, it } from "vitest";
import type { SlideManifest, SlideRenderRequest } from "./types";
import { createProcessRenderer, type ProcessRunner } from "./worker";

const REQUEST: SlideRenderRequest = {
  sceneId: "s1",
  template: "title",
  props: { title: "Hello" },
  durationSeconds: 3,
  fps: 30,
  width: 1920,
  height: 1080,
};

const MANIFEST: SlideManifest = {
  frames: 90,
  fps: 30,
  width: 1920,
  height: 1080,
  hasAlpha: true,
  pattern: "frame-%04d.png",
};

describe("createProcessRenderer", () => {
  it("passes the request as JSON and parses the manifest", async () => {
    const calls: { file: string; args: readonly string[]; input: string }[] = [];

    const run: ProcessRunner = async (file, args, options) => {
      calls.push({ file, args, input: options.input });
      return { stdout: JSON.stringify(MANIFEST), stderr: "" };
    };

    const renderer = createProcessRenderer({
      command: "node",
      args: ["tools/render.mjs"],
      run,
    });

    const manifest = await renderer.render(REQUEST, { outputDirectory: "/cache/x" });

    expect(manifest).toEqual(MANIFEST);
    expect(calls[0]?.file).toBe("node");
    expect(calls[0]?.args).toEqual(["tools/render.mjs"]);

    const input = JSON.parse(calls[0]?.input ?? "{}") as Record<string, unknown>;
    expect(input).toMatchObject({
      template: "title",
      outputDirectory: "/cache/x",
      durationSeconds: 3,
    });
  });

  it("rejects an unreadable manifest", async () => {
    const run: ProcessRunner = async () => ({ stdout: "not json", stderr: "" });
    const renderer = createProcessRenderer({ command: "node", run });

    await expect(renderer.render(REQUEST, { outputDirectory: "/c" })).rejects.toMatchObject({
      code: "invalid-manifest",
    });
  });

  it("rejects a manifest with impossible geometry", async () => {
    const run: ProcessRunner = async () => ({
      stdout: JSON.stringify({ ...MANIFEST, frames: 0 }),
      stderr: "",
    });
    const renderer = createProcessRenderer({ command: "node", run });

    await expect(renderer.render(REQUEST, { outputDirectory: "/c" })).rejects.toMatchObject({
      code: "invalid-manifest",
    });
  });

  it("times out a render that never finishes", async () => {
    const run: ProcessRunner = (_file, _args, options) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });

    const renderer = createProcessRenderer({ command: "node", run, timeoutMs: 5 });

    await expect(renderer.render(REQUEST, { outputDirectory: "/c" })).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("reports cancellation", async () => {
    const controller = new AbortController();
    const run: ProcessRunner = (_file, _args, options) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });

    const renderer = createProcessRenderer({ command: "node", run, timeoutMs: 10_000 });
    const promise = renderer.render(REQUEST, {
      outputDirectory: "/c",
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: "cancelled" });
  });
});
