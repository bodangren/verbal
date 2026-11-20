import { describe, expect, it } from "vitest";
import type { BrandKit } from "./brand";
import { buildProvenanceManifest, serializeProvenance } from "./provenance";

const brand: BrandKit = {
  title: { text: "Title" },
  outro: { text: "Outro" },
  contact: { name: "Name" },
  lowerThird: { name: "Name" },
  loudnessLufs: -16,
};

const scenes = [
  { sceneId: "s1", template: "title", hash: "abc" },
  { sceneId: "s2", template: "bullets", hash: "def" },
];

describe("buildProvenanceManifest", () => {
  it("records the output, brand, and scenes", () => {
    const manifest = buildProvenanceManifest({
      createdAt: "2026-11-20T00:00:00.000Z",
      outputPath: "/out/final.mp4",
      brandKit: brand,
      scenes,
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      createdAt: "2026-11-20T00:00:00.000Z",
      outputPath: "/out/final.mp4",
      scenes,
    });
    expect(manifest.brandKitHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      createdAt: "2026-11-20T00:00:00.000Z",
      outputPath: "/out/final.mp4",
      brandKit: brand,
      scenes,
    };

    expect(buildProvenanceManifest(input)).toEqual(buildProvenanceManifest(input));
  });

  it("changes when the brand kit changes", () => {
    const first = buildProvenanceManifest({
      createdAt: "2026-11-20T00:00:00.000Z",
      outputPath: "/out/final.mp4",
      brandKit: brand,
      scenes,
    });
    const second = buildProvenanceManifest({
      createdAt: "2026-11-20T00:00:00.000Z",
      outputPath: "/out/final.mp4",
      brandKit: { ...brand, loudnessLufs: -23 },
      scenes,
    });

    expect(first.brandKitHash).not.toBe(second.brandKitHash);
  });

  it("includes music provenance when present", () => {
    const manifest = buildProvenanceManifest({
      createdAt: "2026-11-20T00:00:00.000Z",
      outputPath: "/out/final.mp4",
      brandKit: { ...brand, music: { assetPath: "assets/music.mp3", volume: 0.25 } },
      scenes,
    });

    expect(manifest.music?.assetPath).toBe("assets/music.mp3");
    expect(manifest.music?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("serialises with a newline", () => {
    const manifest = buildProvenanceManifest({
      createdAt: "2026-11-20T00:00:00.000Z",
      outputPath: "/out/final.mp4",
      brandKit: brand,
      scenes,
    });

    expect(serializeProvenance(manifest).endsWith("\n")).toBe(true);
  });
});
