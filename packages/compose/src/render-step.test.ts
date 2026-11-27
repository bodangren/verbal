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

function filterOf(run: ReturnType<typeof vi.fn>): string {
  const args = argsOf(run);
  return args[args.indexOf("-filter_complex") + 1] ?? "";
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
    expect(args.join(" ")).toContain("anullsrc");
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

  it("uses an asset image without rendering a slide", async () => {
    const { deps, renderer, run } = makeDeps({
      scenes: new Map([
        ["s1", { template: "bullets", props: { title: "Point" } }],
        ["img", { assetPath: "/project/assets/generated/abc" }],
      ]),
    });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "img", durationSeconds: 1 }, 0);

    expect(renderer.render).not.toHaveBeenCalled();
    const args = argsOf(run);
    expect(args).toContain("-loop");
    expect(args).toContain("/project/assets/generated/abc");
  });

  it("cuts a source range for a talk scene", async () => {
    const { deps, renderer, run } = makeDeps({
      scenes: new Map([
        [
          "talk",
          {
            videoRange: { input: "/media/take.mp4", startSeconds: 2, durationSeconds: 3 },
          },
        ],
      ]),
    });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "talk", durationSeconds: 3 }, 0);

    expect(renderer.render).not.toHaveBeenCalled();
    const args = argsOf(run);
    expect(args).toContain("-ss");
    expect(args[args.indexOf("-ss") + 1]).toBe("2.000");
    expect(args).toContain("/media/take.mp4");
  });

  it("adds silent audio to a talk cut when the speaker has no audio stream", async () => {
    const { deps, run } = makeDeps({
      speaker: { input: "/media/take.mp4", hasAudio: false },
      scenes: new Map([
        [
          "talk",
          {
            videoRange: { input: "/media/take.mp4", startSeconds: 2, durationSeconds: 3 },
          },
        ],
      ]),
    });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "talk", durationSeconds: 3 }, 0);

    const args = argsOf(run);
    expect(args).toContain("anullsrc=r=48000:cl=mono");
    expect(args).toContain("1:a:0");
  });

  it("keeps the talk cut argv free of silent audio when the speaker has audio", async () => {
    const { deps, run } = makeDeps({
      speaker: { input: "/media/take.mp4", hasAudio: true },
      scenes: new Map([
        [
          "talk",
          {
            videoRange: { input: "/media/take.mp4", startSeconds: 2, durationSeconds: 3 },
          },
        ],
      ]),
    });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "talk", durationSeconds: 3 }, 0);

    expect(argsOf(run)).not.toContain("anullsrc=r=48000:cl=mono");
  });

  it("composites a video asset without looping it", async () => {
    const { deps, renderer, run } = makeDeps({
      scenes: new Map([
        ["vid", { assetPath: "/project/assets/generated/clip", assetKind: "video" }],
      ]),
    });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "vid", durationSeconds: 1 }, 0);

    expect(renderer.render).not.toHaveBeenCalled();
    const args = argsOf(run);
    expect(args).not.toContain("-loop");
    expect(args).toContain("/project/assets/generated/clip");
  });

  it("seeks the speaker to the scene start for a slide scene", async () => {
    const { deps, run } = makeDeps();
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "s1", durationSeconds: 2, startSeconds: 30 }, 0);

    const args = argsOf(run);
    const seek = args.indexOf("-ss");
    const speakerIndex = args.indexOf("/media/speaker.mp4");

    expect(seek).toBeGreaterThanOrEqual(0);
    expect(args[seek + 1]).toBe("30.000");
    expect(speakerIndex).toBeGreaterThan(seek);
  });

  it("seeks the speaker to the scene start for an asset scene", async () => {
    const { deps, renderer, run } = makeDeps({
      scenes: new Map([["img", { assetPath: "/project/assets/generated/abc" }]]),
    });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "img", durationSeconds: 2, startSeconds: 30 }, 0);

    expect(renderer.render).not.toHaveBeenCalled();
    const args = argsOf(run);
    const seek = args.indexOf("-ss");
    const speakerIndex = args.indexOf("/media/speaker.mp4");

    expect(seek).toBeGreaterThanOrEqual(0);
    expect(args[seek + 1]).toBe("30.000");
    expect(speakerIndex).toBeGreaterThan(seek);
  });

  it("mixes the speaker audio when the speaker has an audio stream", async () => {
    const { deps, run } = makeDeps({ speaker: { input: "/media/speaker.mp4", hasAudio: true } });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "s1", durationSeconds: 2, startSeconds: 30 }, 0);

    expect(filterOf(run)).toContain("[1:a]");
  });

  it("feeds silence instead of speaker audio when the speaker has no audio stream", async () => {
    const { deps, run } = makeDeps({ speaker: { input: "/media/speaker.mp4", hasAudio: false } });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "s1", durationSeconds: 2, startSeconds: 30 }, 0);

    const args = argsOf(run);
    expect(filterOf(run)).not.toContain("[1:a]");
    expect(filterOf(run)).toContain("anullsrc");
    expect(args[args.indexOf("-ss") + 1]).toBe("30.000");
  });

  it("opens the speaker without a seek when the step has no start", async () => {
    const { deps, run } = makeDeps();
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "s1", durationSeconds: 1 }, 1);

    expect(argsOf(run)).not.toContain("-ss");
  });

  it("passes the abort signal to the slide renderer and the composite run", async () => {
    const controller = new AbortController();
    const { deps, renderer, run } = makeDeps({ signal: controller.signal });
    const render = createStepRenderer(deps);

    await render({ kind: "brand", role: "title", durationSeconds: 1, text: "Hello" }, 0);

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ template: "title" }),
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(run).toHaveBeenCalledWith("ffmpeg", expect.any(Array), { signal: controller.signal });
  });

  it("passes the abort signal to the video-range run", async () => {
    const controller = new AbortController();
    const { deps, renderer, run } = makeDeps({
      signal: controller.signal,
      scenes: new Map([
        ["talk", { videoRange: { input: "/media/take.mp4", startSeconds: 2, durationSeconds: 3 } }],
      ]),
    });
    const render = createStepRenderer(deps);

    await render({ kind: "scene", sceneId: "talk", durationSeconds: 3 }, 0);

    expect(renderer.render).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith("ffmpeg", expect.any(Array), { signal: controller.signal });
  });
});
