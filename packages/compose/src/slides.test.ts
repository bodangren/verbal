import { describe, expect, it, vi } from "vitest";
import { createMemorySlideCache } from "./cache";
import { renderSceneSlide, slideRequestHash } from "./slides";
import {
  SlideError,
  type SlideManifest,
  type SlideRenderRequest,
  type SlideRenderer,
} from "./types";

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

function renderer(render: SlideRenderer["render"] = async () => MANIFEST): SlideRenderer {
  return { render: vi.fn(render) };
}

describe("slideRequestHash", () => {
  it("ignores the scene id", () => {
    expect(slideRequestHash(REQUEST)).toBe(slideRequestHash({ ...REQUEST, sceneId: "other" }));
  });

  it("changes when the duration changes", () => {
    expect(slideRequestHash(REQUEST)).not.toBe(
      slideRequestHash({ ...REQUEST, durationSeconds: 4 }),
    );
  });

  it("changes when the output geometry changes", () => {
    expect(slideRequestHash(REQUEST)).not.toBe(slideRequestHash({ ...REQUEST, width: 1280 }));
  });

  it("returns a stable hexadecimal digest", () => {
    expect(slideRequestHash(REQUEST)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("renderSceneSlide", () => {
  it("renders on a cache miss and records the manifest", async () => {
    const cache = createMemorySlideCache("/cache");
    const slideRenderer = renderer();

    const outcome = await renderSceneSlide({ renderer: slideRenderer, cache }, REQUEST);

    expect(outcome).toMatchObject({ status: "rendered", cached: false });
    expect(slideRenderer.render).toHaveBeenCalledTimes(1);
    expect(await cache.readManifest(slideRequestHash(REQUEST))).toEqual(MANIFEST);
  });

  it("uses the cache on a hit without invoking the renderer", async () => {
    const cache = createMemorySlideCache("/cache");
    await cache.writeManifest(slideRequestHash(REQUEST), MANIFEST);
    const slideRenderer = renderer();

    const outcome = await renderSceneSlide({ renderer: slideRenderer, cache }, REQUEST);

    expect(outcome).toMatchObject({ status: "rendered", cached: true });
    expect(slideRenderer.render).not.toHaveBeenCalled();
  });

  it("returns a placeholder when the renderer fails", async () => {
    const cache = createMemorySlideCache("/cache");
    const slideRenderer = renderer(async () => {
      throw new Error("chromium crashed");
    });

    const outcome = await renderSceneSlide({ renderer: slideRenderer, cache }, REQUEST);

    expect(outcome).toMatchObject({ status: "placeholder", error: "chromium crashed" });
  });

  it("propagates cancellation instead of returning a placeholder", async () => {
    const cache = createMemorySlideCache("/cache");
    const slideRenderer = renderer(async () => {
      throw new SlideError("cancelled", "cancelled");
    });

    await expect(
      renderSceneSlide({ renderer: slideRenderer, cache }, REQUEST),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("passes the cache directory and signal to the renderer", async () => {
    const cache = createMemorySlideCache("/cache");
    const signal = new AbortController().signal;
    const render = vi.fn(async (_request, options) => {
      expect(options.outputDirectory).toBe(`/cache/${slideRequestHash(REQUEST)}`);
      expect(options.signal).toBe(signal);
      return MANIFEST;
    });

    await renderSceneSlide({ renderer: { render }, cache }, REQUEST, { signal });
  });
});
