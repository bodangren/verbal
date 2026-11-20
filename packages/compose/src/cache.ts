import path from "node:path";
import { writeFileAtomic, type FileSystem } from "@verbal/core";
import type { SlideManifest } from "./types";

/** Content-addressed store for rendered slide frames. */
export interface SlideCache {
  has(hash: string): Promise<boolean>;
  readManifest(hash: string): Promise<SlideManifest | null>;
  writeManifest(hash: string, manifest: SlideManifest): Promise<void>;
  /** Directory where the frames for `hash` belong. */
  directory(hash: string): string;
}

function isManifest(value: unknown): value is SlideManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.frames === "number" &&
    typeof record.fps === "number" &&
    typeof record.width === "number" &&
    typeof record.height === "number" &&
    typeof record.hasAlpha === "boolean" &&
    typeof record.pattern === "string"
  );
}

/** In-memory cache, used by tests and by fast-preview dry runs. */
export function createMemorySlideCache(root = "/cache"): SlideCache {
  const manifests = new Map<string, SlideManifest>();

  return {
    async has(hash) {
      return manifests.has(hash);
    },
    async readManifest(hash) {
      return manifests.get(hash) ?? null;
    },
    async writeManifest(hash, manifest) {
      manifests.set(hash, manifest);
    },
    directory(hash) {
      return path.posix.join(root, hash);
    },
  };
}

/** File-backed cache: one directory per content hash. */
export function createFileSlideCache(fs: FileSystem, root: string): SlideCache {
  const manifestPath = (hash: string): string => path.join(root, hash, "manifest.json");

  const readManifest = async (hash: string): Promise<SlideManifest | null> => {
    try {
      const raw = await fs.readFile(manifestPath(hash));
      const parsed: unknown = JSON.parse(raw);
      return isManifest(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  return {
    async has(hash) {
      return (await readManifest(hash)) !== null;
    },
    readManifest,
    async writeManifest(hash, manifest) {
      const directory = path.join(root, hash);
      await fs.mkdir(directory);
      await writeFileAtomic(fs, manifestPath(hash), `${JSON.stringify(manifest, null, 2)}\n`);
    },
    directory(hash) {
      return path.join(root, hash);
    },
  };
}
