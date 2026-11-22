import { describe, expect, it, vi } from "vitest";
import {
  JobRegistry,
  createMemoryJobStore,
  createProject,
  createTranscript,
  openProject,
  projectPaths,
  saveProject,
  saveTranscript,
} from "@verbal/core";
import type { SlideManifest, SlideRenderer } from "@verbal/compose";
import { createStoryboardApi, startStoryboardExport } from "./storyboard-api";
import { createFakeFileSystem } from "./test-support";

const now = () => new Date("2026-11-20T00:00:00.000Z");

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
      { fs, registry, renderer, run, now },
      { root, outputPath: "/out/final.mp4", brand: BRAND },
    );

    expect(response.status).toBe(400);
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
      { fs, registry, renderer, run, now },
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

  it("follows the preset's container and codecs", async () => {
    const { fs, root, registry, renderer, run } = await setup({ media: true });

    const response = await startStoryboardExport(
      { fs, registry, renderer, run, now },
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
      { fs, registry, renderer, run, now },
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
            assetId: "asset-1",
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
      args.includes("/projects/demo/assets/generated/asset-1"),
    );
    expect(usedAsset).toBe(true);
  });
});
