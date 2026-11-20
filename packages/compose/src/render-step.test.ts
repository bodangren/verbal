import { describe, expect, it, vi } from "vitest";
import { createMemorySlideCache } from "./cache";
import {
  createStepRenderer,
  type RenderStepDeps,
} from "./render-step";
import type { SlideManifest, SlideRenderer } from "./types";

const MANIFEST: SlideManifest = {
  frames: 10,
  fps: 10,
  width: 320,
  height: 180,
  hasAlpha: true,
  pattern: "element-%02d.png",
};

function makeDeps(overrides: Partial<RenderStepDeps> = {}) {
  const renderer: SlideRenderer = { render: vi.fn(async () => MANIFEST) };
  const run = vi.fn(async () => undefined);

  const deps: RenderStepDeps = {
    renderer,
    cache: createMemorySlideCache("/cache"),
    run,
    workDirectory: "/tmp/work",
    geometry: { fps: 10, width: 320, height: 180 },
    speaker: { input: "/media/speaker.mp4" },
    audio: { loudnessLufs: -16 },
    scenes: new Map([["s1", { template: "bullets", props: { title: "Point" } }]]),
    codecs: { videoCodec: "mpeg4", videoArgs: ["-q:v", "5"] },
    ...overrides,
  };

  return { deps, renderer, run };
}

function argsOf(run: ReturnType<typeof vi.fn>): string[] {
  return (run.mock.calls[0]?.[1] as string[] | undefined) ?? [];
}

describe("createStepRenderer", () => {
  it("renders a brand step as a full-frame title", async () => {
    const { deps, renderer, run } = makeDeps();
    const render = createStepRenderer(deps);

    const file = await render(
      { kind: "brand", role: "title", durationSeconds: 1, text: "Hello" },
      0,
    );

    expect(file).toBe("/tmp/work/step-000.mp4");
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ template: "title", props: { title: "Hello" } }),
      expect.anything(),
    );

    const args = argsOf(run);
    expect(args).toContain("-filter_complex");
    expect(args).toContain("mpeg4");
    expect(args.join(" ")).not.toContain("chromakey");
  });

  it("renders a scene with its template and keyed speaker", async () => {
    const { deps, renderer, run } = makeDeps();
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "s1", durationSeconds: 1 }, 1);

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ template: "bullets" }),
      expect.anything(),
    );
    expect(argsOf(run).join(" ")).toContain("chromakey");
  });

  it("rejects an unknown scene", async () => {
    const { deps } = makeDeps();
    const render = createStepRenderer(deps);

    await expect(
      render({ kind: "scene", sceneId: "zzz", durationSeconds: 1 }, 0),
    ).rejects.toMatchObject({ code: "missing-scene" });
  });

  it("rejects when the slide renderer fails", async () => {
    const renderer: SlideRenderer = {
      render: vi.fn(async () => {
        throw new Error("chromium crashed");
      }),
    };
    const { deps } = makeDeps({ renderer });
    const render = createStepRenderer(deps);

    await expect(
      render({ kind: "brand", role: "title", durationSeconds: 1, text: "x" }, 0),
    ).rejects.toMatchObject({ code: "slide-failed" });
  });

  it("reuses cached frames across steps with identical content", async () => {
    const { deps, renderer } = makeDeps();
    const render = createStepRenderer(deps);

    await render({ kind: "brand", role: "title", durationSeconds: 1, text: "Same" }, 0);
    await render({ kind: "brand", role: "title", durationSeconds: 1, text: "Same" }, 1);

    expect(renderer.render).toHaveBeenCalledTimes(1);
  });
});
