import { describe, expect, it, vi } from "vitest";
import {
  createProject,
  projectPaths,
  saveTranscript,
  createTranscript,
} from "@verbal/core";
import type { ImageProvider } from "@verbal/ai";
import { createFileAssetStore, type AssetFileSystem } from "@verbal/compose";
import { generateSceneImage } from "./image-api";
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
      id: "g1",
      anchor: { startWordId: "w0", endWordId: "w1" },
      visual: "generated-image",
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
  await fs.writeFileDurable(
    projectPaths(root).storyboard,
    JSON.stringify(STORYBOARD),
  );

  const assets = createFileAssetStore(new FakeAssetFs(), "/projects/demo/assets/generated");
  const provider: ImageProvider = {
    id: "fake",
    estimateCost: () => 0.25,
    generate: vi.fn(async () => ({
      data: Uint8Array.from([9, 9, 9]),
      mediaType: "image/png",
      model: "fake-image",
      prompt: "a diagram",
    })),
  };

  return { fs, root, assets, provider };
}

describe("generateSceneImage", () => {
  it("returns a cost estimate without generating", async () => {
    const { fs, root, assets, provider } = await setup();

    const response = await generateSceneImage(
      { fs, assets, provider, now },
      { root, sceneId: "g1", prompt: "a diagram", dryRun: true },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ estimate: 0.25, provider: "fake" });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("stores a generated asset and records it on the scene", async () => {
    const { fs, root, assets, provider } = await setup();

    const response = await generateSceneImage(
      { fs, assets, provider, now },
      { root, sceneId: "g1", prompt: "a diagram" },
    );

    expect(response.status).toBe(200);
    const body = response.body as { assetId: string; cost: number; document: { scenes: { assetId?: string }[] } };
    expect(body.cost).toBe(0.25);
    expect(body.assetId).toMatch(/^[0-9a-f]{64}$/);
    expect(body.document.scenes[0]?.assetId).toBe(body.assetId);
    expect(await assets.has(body.assetId)).toBe(true);

    const saved = JSON.parse(fs.files.get(projectPaths(root).storyboard) ?? "{}") as {
      scenes: { assetId?: string }[];
    };
    expect(saved.scenes[0]?.assetId).toBe(body.assetId);
  });

  it("rejects an unknown scene", async () => {
    const { fs, root, assets, provider } = await setup();

    const response = await generateSceneImage(
      { fs, assets, provider, now },
      { root, sceneId: "zzz", prompt: "x" },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a scene that is not a generated image", async () => {
    const { fs, root, assets, provider } = await setup();
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

    const response = await generateSceneImage(
      { fs, assets, provider, now },
      { root, sceneId: "s1", prompt: "x" },
    );

    expect(response.status).toBe(400);
  });

  it("rejects an empty prompt", async () => {
    const { fs, root, assets, provider } = await setup();

    const response = await generateSceneImage(
      { fs, assets, provider, now },
      { root, sceneId: "g1", prompt: "  " },
    );

    expect(response.status).toBe(400);
  });
});
