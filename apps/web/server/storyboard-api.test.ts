import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  JobRegistry,
  createMemoryJobStore,
  createProject,
  createTranscript,
  insertSilence,
  moveRange,
  openProject,
  projectPaths,
  removeRange,
  saveProject,
  saveTranscript,
} from "@verbal/core";
import type { SlideManifest, SlideRenderer } from "@verbal/compose";
import { createStoryboardApi, startStoryboardExport } from "./storyboard-api";
import { createFakeFileSystem } from "./test-support";

const now = () => new Date("2026-11-20T00:00:00.000Z");
const identity = async (value: string) => value;
const ASSET_ID = "b".repeat(64);

const MANIFEST: SlideManifest = {
  frames: 10,
  fps: 10,
  width: 320,
  height: 180,
  hasAlpha: true,
  pattern: "element-%02d.png",
};

const BRAND = {
  title: { text: "Title" },
  outro: { text: "Outro" },
  contact: { name: "Name" },
  lowerThird: { name: "Name" },
  loudnessLufs: -16,
};

const STORYBOARD = {
  schemaVersion: 1,
  scenes: [
    {
      id: "s1",
      anchor: { startWordId: "w0", endWordId: "w1" },
      visual: "slide",
      layer: "speaker-inset",
      template: "title",
      props: { title: "Hello" },
    },
  ],
};

async function seed(fs: ReturnType<typeof createFakeFileSystem>, root: string) {
  await createProject(fs, root, { name: "Demo", id: "p1" });
  await saveTranscript(
    fs,
    projectPaths(root).transcript,
    createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2 },
    ]),
  );
}

describe("storyboard document API", () => {
  it("loads an empty storyboard when none exists", async () => {
    const fs = createFakeFileSystem();
    await seed(fs, "/projects/demo");
    const api = createStoryboardApi({ fs });

    const response = await api.load({ root: "/projects/demo" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ schemaVersion: 1, scenes: [] });
  });

  it("saves and reloads a storyboard", async () => {
    const fs = createFakeFileSystem();
    await seed(fs, "/projects/demo");
    const api = createStoryboardApi({ fs });

    expect((await api.save({ root: "/projects/demo", document: STORYBOARD })).status).toBe(200);
    expect((await api.load({ root: "/projects/demo" })).body).toEqual(STORYBOARD);
  });

  it("rejects an invalid storyboard", async () => {
    const fs = createFakeFileSystem();
    await seed(fs, "/projects/demo");
    const api = createStoryboardApi({ fs });

    expect((await api.save({ root: "/projects/demo", document: { scenes: [] } })).status).toBe(
      400,
    );
  });

  it("rejects a relative root", async () => {
    const api = createStoryboardApi({ fs: createFakeFileSystem() });

    expect((await api.load({ root: "demo" })).status).toBe(400);
  });
});

describe("storyboard preview API", () => {
  it("plans a fast preview with placeholders", async () => {
    const fs = createFakeFileSystem();
    await seed(fs, "/projects/demo");
    const api = createStoryboardApi({ fs });
    await api.save({ root: "/projects/demo", document: STORYBOARD });

    const response = await api.preview({
      root: "/projects/demo",
      tier: "fast",
      geometry: { fps: 10, width: 320, height: 180 },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ tier: "fast", scenes: [{ source: "placeholder" }] });
  });

  it("plans renders on the full tier", async () => {
    const fs = createFakeFileSystem();
    await seed(fs, "/projects/demo");
    const api = createStoryboardApi({ fs });
    await api.save({ root: "/projects/demo", document: STORYBOARD });

    const response = await api.preview({ root: "/projects/demo", tier: "full" });

    expect(response.body).toMatchObject({ tier: "full", scenes: [{ source: "render" }] });
  });

  it("reports a missing transcript as not found", async () => {
    const fs = createFakeFileSystem();
    await createProject(fs, "/projects/demo", { name: "Demo" });
    const api = createStoryboardApi({ fs });

    expect((await api.preview({ root: "/projects/demo" })).status).toBe(404);
  });

  it("reports the cut length of a talk scene, not its source span", async () => {
    const fs = createFakeFileSystem();
    const root = "/projects/demo";
    await createProject(fs, root, { name: "Demo", id: "p1" });
    const transcript = removeRange(
      insertSilence(
        createTranscript([
          { text: "one", start: 0, end: 1 },
          { text: "two", start: 1, end: 2 },
          { text: "three", start: 2, end: 3 },
          { text: "four", start: 3, end: 4 },
        ]),
        "w3",
        1.5,
      ),
      1,
      1,
    );
    await saveTranscript(fs, projectPaths(root).transcript, transcript);
    const api = createStoryboardApi({ fs });
    await api.save({
      root,
      document: {
        schemaVersion: 1,
        scenes: [
          {
            id: "t1",
            anchor: { startWordId: "w0", endWordId: "w3" },
            visual: "talk",
            layer: "full-frame",
          },
        ],
      },
    });

    const response = await api.preview({ root, tier: "fast" });
    const scene = (response.body as { scenes: { startSeconds: number; endSeconds: number; playSeconds?: number }[] })
      .scenes[0];

    // Source span stays 0-4 s. Removing "two" with 0.05 s handles takes 1.1 s.
    // The inserted 1.5 s of silence is added back.
    expect(scene?.startSeconds).toBe(0);
    expect(scene?.endSeconds).toBe(4);
    expect(scene?.playSeconds).toBeCloseTo(4 - 1.1 + 1.5, 3);
  });

  it("leaves playSeconds off a slide scene", async () => {
    const fs = createFakeFileSystem();
    await seed(fs, "/projects/demo");
    const api = createStoryboardApi({ fs });
    await api.save({ root: "/projects/demo", document: STORYBOARD });

    const response = await api.preview({ root: "/projects/demo", tier: "fast" });

    expect(
      (response.body as { scenes: { playSeconds?: number }[] }).scenes[0]?.playSeconds,
    ).toBeUndefined();
  });
});

describe("storyboard export API", () => {
  async function setup(options: { media: boolean; storyboard?: unknown }) {
    const fs = createFakeFileSystem();
    const root = "/projects/demo";
    await seed(fs, root);

    if (options.media) {
      const project = await openProject(fs, root);
      await saveProject(fs, root, {
        ...project,
        media: { assetPath: "assets/take.mp4" },
      });
    }

    await fs.writeFileDurable(
      projectPaths(root).storyboard,
      JSON.stringify(options.storyboard ?? STORYBOARD),
    );

    const registry = await JobRegistry.open(createMemoryJobStore(), now);
    const renderer: SlideRenderer = { render: vi.fn(async () => MANIFEST) };
    const run = vi.fn(async () => undefined);

    return { fs, root, registry, renderer, run };
  }

  it("rejects a project without media", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: false });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      { root, outputPath: "/out/final.mp4", brand: BRAND },
    );

    expect(response.status).toBe(400);
  });

  it("refuses a renderer-dependent export when Remotion is not installed", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: true });
    const before = registry.list().length;

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => false },
      { root, outputPath: "/out/final.mp4", brand: BRAND },
    );

    expect(response.status).toBe(503);
    expect((response.body as { error: string }).error).toContain("remotion");
    expect(registry.list().length).toBe(before);
  });

  it("starts a renderer-dependent export when Remotion is installed", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: true });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      { root, outputPath: "/out/final.mp4", brand: BRAND },
    );

    expect(response.status).toBe(202);
  });

  it("starts an export for a talk-only storyboard", async () => {
    const { fs, root, registry, renderer, run } = await setup({
      media: true,
      storyboard: {
        schemaVersion: 1,
        scenes: [
          {
            id: "talk",
            anchor: { startWordId: "w0", endWordId: "w1" },
            visual: "talk",
            layer: "full-frame",
          },
        ],
      },
    });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      { root, outputPath: "/out/final.mp4", brand: BRAND },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(registry.get(jobId)).toMatchObject({ status: "done" });
    const rangeCall = run.mock.calls.find((call) => {
      const args = (call as unknown[])[1];
      return Array.isArray(args) && args.includes("-ss");
    });
    expect(rangeCall).toBeDefined();
  });

  it("applies transcript deletions to talk ranges", async () => {
    const { fs, root, registry, renderer, run } = await setup({
      media: true,
      storyboard: {
        schemaVersion: 1,
        scenes: [
          {
            id: "talk",
            anchor: { startWordId: "w0", endWordId: "w2" },
            visual: "talk",
            layer: "full-frame",
          },
        ],
      },
    });

    const transcript = removeRange(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
        { text: "three", start: 2, end: 3 },
      ]),
      1,
      1,
    );
    await saveTranscript(fs, projectPaths(root).transcript, transcript);

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      { root, outputPath: "/out/final.mp4", brand: BRAND },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(registry.get(jobId)).toMatchObject({ status: "done" });

    const starts = (run.mock.calls as unknown as [string, string[]][])
      .filter(([, args]) => args.includes("-ss"))
      .map(([, args]) => args[args.indexOf("-ss") + 1]);
    expect(starts).toEqual(["0.000", "2.050"]);
  });

  it("keeps moved talk ranges in transcript order", async () => {
    const { fs, root, registry, renderer, run } = await setup({
      media: true,
      storyboard: {
        schemaVersion: 1,
        scenes: [
          {
            id: "talk",
            anchor: { startWordId: "w0", endWordId: "w1" },
            visual: "talk",
            layer: "full-frame",
          },
        ],
      },
    });

    const transcript = moveRange(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
        { text: "three", start: 2, end: 3 },
      ]),
      1,
      1,
      2,
    );
    await saveTranscript(fs, projectPaths(root).transcript, transcript);

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      { root, outputPath: "/out/final.mp4", brand: BRAND },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(registry.get(jobId)).toMatchObject({ status: "done" });

    const starts = (run.mock.calls as unknown as [string, string[]][])
      .filter(([, args]) => args.includes("-ss"))
      .map(([, args]) => args[args.indexOf("-ss") + 1]);
    expect(starts).toEqual(["0.000", "2.000", "1.000"]);
  });

  it("renders inserted silence in a talk scene", async () => {
    const { fs, root, registry, renderer, run } = await setup({
      media: true,
      storyboard: {
        schemaVersion: 1,
        scenes: [
          {
            id: "talk",
            anchor: { startWordId: "w0", endWordId: "w1" },
            visual: "talk",
            layer: "full-frame",
          },
        ],
      },
    });

    const transcript = insertSilence(
      createTranscript([
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
      ]),
      "w0",
      1.5,
    );
    await saveTranscript(fs, projectPaths(root).transcript, transcript);

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      { root, outputPath: "/out/final.mp4", brand: BRAND },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(registry.get(jobId)).toMatchObject({ status: "done" });

    const starts = (run.mock.calls as unknown as [string, string[]][])
      .filter(([, args]) => args.includes("-ss"))
      .map(([, args]) => args[args.indexOf("-ss") + 1]);
    expect(starts).toEqual(["0.000", "1.000"]);
    const silenceArgs = (run.mock.calls as unknown as [string, string[]][]).find(([, args]) => {
      const joined = args.join(" ");
      return joined.includes("anullsrc") && joined.includes("color=c=black");
    });
    expect(silenceArgs).toBeDefined();
    const args = silenceArgs?.[1] ?? [];
    expect(args[args.indexOf("-t") + 1]).toBe("1.500");
  });

  it("follows the preset's container and codecs", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: true });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      { root, outputPath: "/out/final.mp4", brand: BRAND, preset: "webm-vp9" },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(registry.get(jobId)).toMatchObject({
      status: "done",
      result: { outputPath: "/out/final.webm" },
    });
    const codecCall = run.mock.calls.find((call) => {
      const args = (call as unknown[])[1];
      return Array.isArray(args) && args.includes("libvpx-vp9");
    });
    expect(codecCall).toBeDefined();
  });

  it("starts an export job that completes with provenance", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: true });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      {
        root,
        outputPath: "/out/final.mp4",
        brand: BRAND,
        geometry: { fps: 10, width: 320, height: 180 },
      },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(registry.get(jobId)).toMatchObject({
      status: "done",
      message: "Export complete",
      result: {
        outputPath: "/out/final.mp4",
        manifestPath: "/out/final.mp4.provenance.json",
        files: 3,
      },
    });
    expect(fs.files.has("/out/final.mp4.provenance.json")).toBe(true);
  });

  it("omits the brand bookends when includeBrand is false", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: true });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      {
        root,
        outputPath: "/out/final.mp4",
        brand: BRAND,
        includeBrand: false,
      },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(registry.get(jobId)).toMatchObject({
      status: "done",
      result: { files: 1 },
    });
  });

  it("renders only the title card when outro and contact are empty", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: true });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      {
        root,
        outputPath: "/out/final.mp4",
        brand: {
          ...BRAND,
          outro: { text: "" },
          contact: { name: "" },
          lowerThird: { name: "" },
        },
      },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(registry.get(jobId)).toMatchObject({
      status: "done",
      result: { files: 2 },
    });
  });

  it("rejects a non-boolean includeBrand", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: true });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now, rendererReady: () => true },
      {
        root,
        outputPath: "/out/final.mp4",
        brand: BRAND,
        includeBrand: "no",
      },
    );

    expect(response.status).toBe(400);
  });

  it("renders a generated-image scene from its asset", async () => {
    const { fs, root, registry, renderer, run } = await setup({
      media: true,
      storyboard: {
        schemaVersion: 1,
        scenes: [
          {
            id: "g1",
            anchor: { startWordId: "w0", endWordId: "w1" },
            visual: "generated-image",
            layer: "full-frame",
            assetId: ASSET_ID,
          },
        ],
      },
    });

    const response = await startStoryboardExport(
      {
        fs,
        registry,
        renderer,
        run,
        now,
        rendererReady: () => true,
        realpath: identity,
      },
      {
        root,
        outputPath: "/out/final.mp4",
        brand: BRAND,
        geometry: { fps: 10, width: 320, height: 180 },
      },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(registry.get(jobId)?.status).toBe("done");
    const calls = run.mock.calls as unknown as [string, string[]][];
    const usedAsset = calls.some(([, args]) =>
      args.includes(`/projects/demo/assets/generated/${ASSET_ID}`),
    );
    expect(usedAsset).toBe(true);
  });

  describe("generated asset and music containment", () => {
    const GENERATED_STORYBOARD = (assetId: string) => ({
      schemaVersion: 1,
      scenes: [
        {
          id: "hero",
          anchor: { startWordId: "w0", endWordId: "w1" },
          visual: "generated-image",
          layer: "full-frame",
          assetId,
        },
      ],
    });

    it("rejects a generated asset id that climbs out of the asset folder", async () => {
      const { fs, root, registry, renderer, run } = await setup({
        media: true,
        storyboard: GENERATED_STORYBOARD("../x"),
      });

      const response = await startStoryboardExport(
        { fs, registry, renderer, run, now, rendererReady: () => true, realpath: identity },
        { root, outputPath: "/out/final.mp4", brand: BRAND },
      );

      expect(response.status).toBe(400);
      expect((response.body as { error: string }).error).toContain("scene hero");
      expect(registry.list()).toHaveLength(0);
    });

    it("rejects an asset whose file is a symlink out of the project", async () => {
      const { fs, root, registry, renderer, run } = await setup({
        media: true,
        storyboard: GENERATED_STORYBOARD(ASSET_ID),
      });
      const escaping = async (value: string) =>
        value.endsWith(ASSET_ID) ? "/etc/passwd" : value;

      const response = await startStoryboardExport(
        { fs, registry, renderer, run, now, rendererReady: () => true, realpath: escaping },
        { root, outputPath: "/out/final.mp4", brand: BRAND },
      );

      expect(response.status).toBe(400);
      expect(registry.list()).toHaveLength(0);
      expect(run).not.toHaveBeenCalled();
    });

    it("rejects brand music that climbs out of the project", async () => {
      const { fs, root, registry, renderer, run } = await setup({ media: true });

      const response = await startStoryboardExport(
        { fs, registry, renderer, run, now, rendererReady: () => true, realpath: identity },
        {
          root,
          outputPath: "/out/final.mp4",
          brand: { ...BRAND, music: { assetPath: "../../etc/passwd", volume: 0.25 } },
        },
      );

      expect(response.status).toBe(400);
      expect(registry.list()).toHaveLength(0);
    });

    it("rejects brand music whose file is a symlink out of the project", async () => {
      const { fs, root, registry, renderer, run } = await setup({ media: true });
      const escaping = async (value: string) =>
        value.endsWith("music.mp3") ? "/etc/music.mp3" : value;

      const response = await startStoryboardExport(
        { fs, registry, renderer, run, now, rendererReady: () => true, realpath: escaping },
        {
          root,
          outputPath: "/out/final.mp4",
          brand: { ...BRAND, music: { assetPath: "assets/music.mp3", volume: 0.25 } },
        },
      );

      expect(response.status).toBe(400);
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe("private work directory", () => {
    const TALK_STORYBOARD = {
      schemaVersion: 1,
      scenes: [
        {
          id: "talk",
          anchor: { startWordId: "w0", endWordId: "w1" },
          visual: "talk",
          layer: "full-frame",
        },
      ],
    };

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function waitForJob(registry: JobRegistry, jobId: string) {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const status = registry.get(jobId)?.status;
        if (status === "done" || status === "failed") {
          return;
        }
        await delay(10);
      }
    }

    function delayedRunner(fs: ReturnType<typeof createFakeFileSystem>, failConcat = false) {
      const concatLists: { dir: string; content: string | undefined }[] = [];
      const run = vi.fn(async (_file: string, args: readonly string[]) => {
        if (args[args.indexOf("-f") + 1] !== "concat") {
          await delay(5);
          return;
        }
        await delay(100);
        const listPath = args[args.indexOf("-i") + 1] ?? "";
        concatLists.push({ dir: path.posix.dirname(listPath), content: fs.files.get(listPath) });
        if (failConcat) {
          throw new Error("concat failed");
        }
      });
      return { run, concatLists };
    }

    function exportDeps(
      fs: ReturnType<typeof createFakeFileSystem>,
      registry: JobRegistry,
      renderer: SlideRenderer,
      run: (file: string, args: readonly string[]) => Promise<unknown>,
    ) {
      const removeDirectory = vi.fn(async (directory: string) => {
        fs.directories.delete(directory);
      });
      return {
        deps: { fs, registry, renderer, run, now, rendererReady: () => true, removeDirectory },
        removeDirectory,
      };
    }

    const GEOMETRY = { fps: 10, width: 320, height: 180 };

    it("gives two overlapping exports of one project separate work directories", async () => {
      const fs = createFakeFileSystem();
      const root = "/projects/demo";
      await seed(fs, root);
      const project = await openProject(fs, root);
      await saveProject(fs, root, { ...project, media: { assetPath: "assets/take.mp4" } });
      const registry = await JobRegistry.open(createMemoryJobStore(), now);
      const renderer: SlideRenderer = { render: vi.fn(async () => MANIFEST) };
      const { run, concatLists } = delayedRunner(fs);
      const { deps } = exportDeps(fs, registry, renderer, run);

      await fs.writeFileDurable(projectPaths(root).storyboard, JSON.stringify(STORYBOARD));
      const first = await startStoryboardExport(deps, {
        root,
        outputPath: "/out/a.mp4",
        brand: BRAND,
        geometry: GEOMETRY,
      });
      await fs.writeFileDurable(projectPaths(root).storyboard, JSON.stringify(TALK_STORYBOARD));
      const second = await startStoryboardExport(deps, {
        root,
        outputPath: "/out/b.mp4",
        brand: BRAND,
        geometry: GEOMETRY,
      });

      const firstId = (first.body as { id: string }).id;
      const secondId = (second.body as { id: string }).id;
      await waitForJob(registry, firstId);
      await waitForJob(registry, secondId);

      expect(registry.get(firstId)?.status).toBe("done");
      expect(registry.get(secondId)?.status).toBe("done");
      expect(concatLists.map((entry) => entry.dir).sort()).toEqual(
        [`${root}/cache/assembly/${firstId}`, `${root}/cache/assembly/${secondId}`].sort(),
      );
      for (const entry of concatLists) {
        expect(entry.content).toContain(`${entry.dir}/step-`);
      }
    });

    it("removes the work directory after a successful export", async () => {
      const fs = createFakeFileSystem();
      const root = "/projects/demo";
      await seed(fs, root);
      const project = await openProject(fs, root);
      await saveProject(fs, root, { ...project, media: { assetPath: "assets/take.mp4" } });
      await fs.writeFileDurable(projectPaths(root).storyboard, JSON.stringify(STORYBOARD));
      const registry = await JobRegistry.open(createMemoryJobStore(), now);
      const renderer: SlideRenderer = { render: vi.fn(async () => MANIFEST) };
      const { run } = delayedRunner(fs);
      const { deps, removeDirectory } = exportDeps(fs, registry, renderer, run);

      const response = await startStoryboardExport(deps, {
        root,
        outputPath: "/out/final.mp4",
        brand: BRAND,
        geometry: GEOMETRY,
      });
      const jobId = (response.body as { id: string }).id;
      await waitForJob(registry, jobId);

      expect(registry.get(jobId)?.status).toBe("done");
      expect(removeDirectory).toHaveBeenCalledWith(`${root}/cache/assembly/${jobId}`);
      expect(fs.directories.has(`${root}/cache/assembly/${jobId}`)).toBe(false);
    });

    it("removes the work directory after a failed export", async () => {
      const fs = createFakeFileSystem();
      const root = "/projects/demo";
      await seed(fs, root);
      const project = await openProject(fs, root);
      await saveProject(fs, root, { ...project, media: { assetPath: "assets/take.mp4" } });
      await fs.writeFileDurable(projectPaths(root).storyboard, JSON.stringify(STORYBOARD));
      const registry = await JobRegistry.open(createMemoryJobStore(), now);
      const renderer: SlideRenderer = { render: vi.fn(async () => MANIFEST) };
      const { run } = delayedRunner(fs, true);
      const { deps, removeDirectory } = exportDeps(fs, registry, renderer, run);

      const response = await startStoryboardExport(deps, {
        root,
        outputPath: "/out/final.mp4",
        brand: BRAND,
        geometry: GEOMETRY,
      });
      const jobId = (response.body as { id: string }).id;
      await waitForJob(registry, jobId);

      expect(registry.get(jobId)?.status).toBe("failed");
      expect(removeDirectory).toHaveBeenCalledWith(`${root}/cache/assembly/${jobId}`);
      expect(fs.directories.has(`${root}/cache/assembly/${jobId}`)).toBe(false);
    });
  });
});
