import { describe, expect, it, vi } from "vitest";
import {
  AssemblyError,
  assembleStoryboard,
  buildConcatArgs,
  buildConcatListContent,
  planAssembly,
  type AssemblyDeps,
} from "./assemble";
import type { BrandKit } from "./brand";

const brand: BrandKit = {
  title: { text: "Title" },
  outro: { text: "Outro" },
  contact: { name: "Name" },
  lowerThird: { name: "Name" },
  loudnessLufs: -16,
};

const scenes = [
  { sceneId: "s1", startSeconds: 0, endSeconds: 2 },
  { sceneId: "s2", startSeconds: 2, endSeconds: 3 },
];

describe("planAssembly", () => {
  it("brackets scenes with a title and an outro", () => {
    expect(planAssembly({ scenes, brand })).toEqual([
      { kind: "brand", role: "title", durationSeconds: 3, text: "Title" },
      { kind: "scene", sceneId: "s1", durationSeconds: 2, startSeconds: 0 },
      { kind: "scene", sceneId: "s2", durationSeconds: 1, startSeconds: 2 },
      { kind: "brand", role: "outro", durationSeconds: 3, text: "Outro", subtitle: "Name" },
    ]);
  });

  it("puts the contact card on the outro", () => {
    const plan = planAssembly({
      scenes: [],
      brand: { ...brand, contact: { name: "Daniel", handle: "@daniel", url: "example.com" } },
    });

    expect(plan.at(-1)).toMatchObject({ subtitle: "Daniel · @daniel · example.com" });
  });

  it("omits the outro when its text and contact are empty", () => {
    const plan = planAssembly({
      scenes,
      brand: { ...brand, outro: { text: "" }, contact: { name: "" } },
    });

    expect(plan).toHaveLength(3);
    expect(plan.at(-1)).toMatchObject({ kind: "scene", sceneId: "s2" });
  });

  it("uses the contact line as outro text when the outro text is empty", () => {
    const plan = planAssembly({
      scenes: [],
      brand: {
        ...brand,
        outro: { text: "" },
        contact: { name: "Daniel", handle: "@daniel" },
      },
    });

    expect(plan.at(-1)).toEqual({
      kind: "brand",
      role: "outro",
      durationSeconds: 3,
      text: "Daniel · @daniel",
    });
  });

  it("keeps the outro text and contact subtitle when both are present", () => {
    expect(planAssembly({ scenes, brand }).at(-1)).toEqual({
      kind: "brand",
      role: "outro",
      durationSeconds: 3,
      text: "Outro",
      subtitle: "Name",
    });
  });

  it("omits the title when its text is empty", () => {
    const plan = planAssembly({ scenes, brand: { ...brand, title: { text: "  " } } });

    expect(plan[0]).toMatchObject({ kind: "scene", sceneId: "s1" });
    expect(plan.some((step) => step.kind === "brand" && step.role === "title")).toBe(false);
  });

  it("omits brand elements when asked", () => {
    expect(planAssembly({ scenes, brand, includeBrand: false })).toEqual([
      { kind: "scene", sceneId: "s1", durationSeconds: 2, startSeconds: 0 },
      { kind: "scene", sceneId: "s2", durationSeconds: 1, startSeconds: 2 },
    ]);
  });

  it("honours custom brand durations", () => {
    const plan = planAssembly({
      scenes,
      brand,
      titleDurationSeconds: 1.5,
      outroDurationSeconds: 2,
    });

    expect(plan[0]).toMatchObject({ durationSeconds: 1.5 });
    expect(plan.at(-1)).toMatchObject({ durationSeconds: 2 });
  });

  it("carries the scene start on each scene step", () => {
    expect(planAssembly({ scenes, brand, includeBrand: false })).toEqual([
      { kind: "scene", sceneId: "s1", durationSeconds: 2, startSeconds: 0 },
      { kind: "scene", sceneId: "s2", durationSeconds: 1, startSeconds: 2 },
    ]);
  });
});

describe("buildConcatListContent", () => {
  it("lists each file on its own line", () => {
    expect(buildConcatListContent(["a.mp4", "b.mp4"])).toBe("file 'a.mp4'\nfile 'b.mp4'\n");
  });

  it("escapes single quotes in paths", () => {
    expect(buildConcatListContent(["/tmp/it's.mp4"])).toContain("it'\\''s");
  });
});

describe("buildConcatArgs", () => {
  it("uses the concat demuxer with stream copy", () => {
    const args = buildConcatArgs("/tmp/list.txt", "/out/final.mp4");

    expect(args).toEqual([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "/tmp/list.txt",
      "-c",
      "copy",
      "-progress",
      "pipe:1",
      "-nostats",
      "/out/final.mp4",
    ]);
  });
});

describe("assembleStoryboard", () => {
  it("renders every step in order and concatenates the results", async () => {
    const rendered: string[] = [];
    const deps: AssemblyDeps = {
      renderStep: async (step) => {
        const file = `/tmp/${step.kind === "scene" ? step.sceneId : step.role}.mp4`;
        rendered.push(file);
        return file;
      },
      concat: vi.fn(async () => undefined),
    };

    const result = await assembleStoryboard(deps, planAssembly({ scenes, brand }), "/out.mp4");

    expect(rendered).toEqual(["/tmp/title.mp4", "/tmp/s1.mp4", "/tmp/s2.mp4", "/tmp/outro.mp4"]);
    expect(result.files).toHaveLength(4);
    expect(deps.concat).toHaveBeenCalledWith(result.files, "/out.mp4");
  });

  it("rejects an empty plan", async () => {
    const deps: AssemblyDeps = {
      renderStep: async () => "/tmp/x.mp4",
      concat: async () => undefined,
    };

    await expect(assembleStoryboard(deps, [], "/out.mp4")).rejects.toBeInstanceOf(AssemblyError);
  });

  it("does not concatenate when a step fails", async () => {
    const concat = vi.fn(async () => undefined);
    const deps: AssemblyDeps = {
      renderStep: async () => {
        throw new Error("render failed");
      },
      concat,
    };

    await expect(
      assembleStoryboard(deps, planAssembly({ scenes, brand }), "/out.mp4"),
    ).rejects.toThrow(/render failed/);
    expect(concat).not.toHaveBeenCalled();
  });

  it("concatenates into the provided output path, including a partial path", async () => {
    const concat = vi.fn(async () => undefined);
    const deps: AssemblyDeps = {
      renderStep: async (step) =>
        `/tmp/${step.kind === "scene" ? step.sceneId : step.role}.mp4`,
      concat,
    };

    const partial = "/out/final.job.partial.mp4";
    const result = await assembleStoryboard(
      deps,
      planAssembly({ scenes, brand, includeBrand: false }),
      partial,
    );

    expect(concat).toHaveBeenCalledWith(["/tmp/s1.mp4", "/tmp/s2.mp4"], partial);
    expect(result.outputPath).toBe(partial);
  });
});
