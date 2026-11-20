import { createHash } from "node:crypto";
import { canonicalJson } from "@verbal/storyboard/hash";
import type { BrandKit } from "./brand";

export const PROVENANCE_SCHEMA_VERSION = 1;

export type ProvenanceScene = {
  sceneId: string;
  template?: string;
  assetId?: string;
  /** Slide content hash, when the scene was rendered from a template. */
  hash?: string;
};

export type ProvenanceMusic = {
  assetPath: string;
  hash: string;
};

export type ProvenanceManifest = {
  schemaVersion: number;
  createdAt: string;
  outputPath: string;
  brandKitHash: string;
  scenes: ProvenanceScene[];
  music?: ProvenanceMusic;
};

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export type BuildProvenanceInput = {
  createdAt: string;
  outputPath: string;
  brandKit: BrandKit;
  scenes: readonly ProvenanceScene[];
};

/**
 * Records what went into an export.
 *
 * The manifest names every template, asset, and music bed, and pins them by
 * hash so a later "same" export can be told apart from one with swapped
 * inputs.
 */
export function buildProvenanceManifest(input: BuildProvenanceInput): ProvenanceManifest {
  const manifest: ProvenanceManifest = {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    createdAt: input.createdAt,
    outputPath: input.outputPath,
    brandKitHash: sha256(input.brandKit),
    scenes: input.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      ...(scene.template === undefined ? {} : { template: scene.template }),
      ...(scene.assetId === undefined ? {} : { assetId: scene.assetId }),
      ...(scene.hash === undefined ? {} : { hash: scene.hash }),
    })),
  };

  if (input.brandKit.music !== undefined) {
    manifest.music = {
      assetPath: input.brandKit.music.assetPath,
      hash: sha256(input.brandKit.music.assetPath),
    };
  }

  return manifest;
}

/** Serialises a provenance manifest with a stable layout. */
export function serializeProvenance(manifest: ProvenanceManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
