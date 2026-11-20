import { describe, expect, it, vi } from "vitest";
import {
  JobRegistry,
  createMemoryJobStore,
  createProject,
  createTranscript,
  projectPaths,
  saveTranscript,
} from "@verbal/core";
import type { VideoProvider } from "@verbal/ai";
import { createFileAssetStore, type AssetFileSystem } from "@verbal/compose";
import { generateSceneVideo } from "./video-api";
import { createFakeFileSystem } from "./test-support";

const now = () => new Date("2026-11-20T00:00:00.000Z");

class FakeAssetFs implements AssetFileSystem {
  readonly bytes = new Map<string, Uint8Array>();
  readonly files = new Map<string, string>();
  async mkdir(): Promise<void> {}
  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.bytes.set(path, data);
  }
  async readBytes(path: string): Promise<Uint8Array> {
    const data = this.bytes.get(path);
    if (data === undefined) throw new Error(`ENOENT: ${path}`);
    return data;
  }
  async writeText(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }
  async readText(path: string): Promise<string> {
    const data = this.files.get(path);
    if (data === undefined) throw new Error(`ENOENT: ${path}`);
    return data;
  }
  async exists(path: string): Promise<boolean> {
    return this.bytes.has(path) || this.files.has(path);
  }
}

const STORYBOARD = {
  schemaVersion: 1,
  scenes: [
    {
      id: "v1",
      anchor: { startWordId: "w0", endWordId: "w1" },
      visual: "generated-video",
      layer: "full-frame",
    },
  ],
};

async function setup() {
  const fs = createFakeFileSystem();
  const root = "/projects/demo";
  await createProject(fs, root, { name: "Demo", id: "p1" });
  await saveTranscript(
    fs,
    projectPaths(root).transcript,
    createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2 },
    ]),
  );
  await fs.writeFileDurable(projectPaths(root).storyboard, JSON.stringify(STORYBOARD));

  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  const assets = createFileAssetStore(new FakeAssetFs(), `${root}/assets/generated`);
  const provider: VideoProvider = {
    id: "fake-video",
    estimateCost: (request) => request.durationSeconds * 0.1,
    generate: vi.fn(async () => ({
      data: Uint8Array.from([4, 4, 4]),
      mediaType: "video/mp4",
      model: "fake-video",
      prompt: "a clip",
    })),
  };

  return { fs, root, registry, assets, provider };
}

describe("generateSceneVideo", () => {
  it("returns a cost estimate without creating a job", async () => {
    const { fs, root, registry, assets, provider } = await setup();

    const response = await generateSceneVideo(
      { fs, registry, assets, provider, now },
      { root, sceneId: "v1", prompt: "a clip", durationSeconds: 4, dryRun: true },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ estimate: 0.4, provider: "fake-video" });
    expect(registry.list()).toHaveLength(0);
  });

  it("runs generation as a job and records the asset on the scene", async () => {
    const { fs, root, registry, assets, provider } = await setup();

    const response = await generateSceneVideo(
      { fs, registry, assets, provider, now },
      { root, sceneId: "v1", prompt: "a clip", durationSeconds: 4 },
    );

    expect(response.status).toBe(202);
    const jobId = (response.body as { id: string }).id;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = registry.get(jobId)?.status;
      if (status === "done" || status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const job = registry.get(jobId);
    expect(job?.status).toBe("done");
    const assetId = (job?.result as { assetId?: string } | null)?.assetId ?? "";
    expect(assetId).toMatch(/^[0-9a-f]{64}$/);
    expect(await assets.has(assetId)).toBe(true);

    const saved = JSON.parse(fs.files.get(projectPaths(root).storyboard) ?? "{}") as {
      scenes: { assetId?: string }[];
    };
    expect(saved.scenes[0]?.assetId).toBe(assetId);
  });

  it("rejects an unknown scene", async () => {
    const { fs, root, registry, assets, provider } = await setup();

    const response = await generateSceneVideo(
      { fs, registry, assets, provider, now },
      { root, sceneId: "zzz", prompt: "x", durationSeconds: 4 },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a scene that is not a generated video", async () => {
    const { fs, root, registry, assets, provider } = await setup();
    await fs.writeFileDurable(
      projectPaths(root).storyboard,
      JSON.stringify({
        schemaVersion: 1,
        scenes: [
          {
            id: "s1",
            anchor: { startWordId: "w0", endWordId: "w1" },
            visual: "slide",
            layer: "full-frame",
            template: "title",
          },
        ],
      }),
    );

    const response = await generateSceneVideo(
      { fs, registry, assets, provider, now },
      { root, sceneId: "s1", prompt: "x", durationSeconds: 4 },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a missing duration", async () => {
    const { fs, root, registry, assets, provider } = await setup();

    const response = await generateSceneVideo(
      { fs, registry, assets, provider, now },
      { root, sceneId: "v1", prompt: "x" },
    );

    expect(response.status).toBe(400);
  });
});
