import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  ProjectError,
  nodeFileSystem,
  projectPaths,
  type FileSystem,
} from "@verbal/core";
import { parseStoryboard } from "@verbal/storyboard";
import { planAssetPrune, type AssetRecord, type PrunePlan } from "@verbal/compose";

export type PruneResult = {
  plan: PrunePlan;
  deleted: string[];
};

export type PruneApiDeps = {
  fs: FileSystem;
  /** Asset ids present in the generated directory (the binary files). */
  listAssetIds: (directory: string) => Promise<string[]>;
  readAssetRecord: (directory: string, id: string) => Promise<AssetRecord | null>;
  removeAsset: (directory: string, id: string) => Promise<void>;
  now: () => Date;
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Parses an asset record sidecar, tolerating a missing or broken one. */
function parseRecord(raw: string, id: string): AssetRecord | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) {
      return null;
    }

    const { mediaType, source, createdAt } = value as Record<string, unknown>;
    if (
      typeof mediaType !== "string" ||
      (source !== "generated" && source !== "user") ||
      typeof createdAt !== "string"
    ) {
      return null;
    }

    return { id, mediaType, source, createdAt };
  } catch {
    return null;
  }
}

/**
 * Plans, and optionally applies, pruning of generated assets.
 *
 * The plan is always returned, so a caller that did not ask to apply still sees
 * what would go. Without an apply the file system is only read.
 */
export function createPruneApi(overrides: Partial<PruneApiDeps> = {}) {
  const deps: PruneApiDeps = {
    fs: nodeFileSystem,
    listAssetIds: async (directory) => {
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isFile() && !entry.name.endsWith(".json"))
          .map((entry) => entry.name);
      } catch (error) {
        if (isNotFound(error)) {
          return [];
        }
        throw error;
      }
    },
    readAssetRecord: async (directory, id) => {
      try {
        return parseRecord(await readFile(path.join(directory, `${id}.json`), "utf8"), id);
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
    removeAsset: async (directory, id) => {
      const file = path.join(directory, id);
      await unlink(file);
      await unlink(`${file}.json`).catch(() => undefined);
    },
    now: () => new Date(),
    ...overrides,
  };

  return {
    async prune(input: { root: string; apply?: boolean }): Promise<PruneResult> {
      const { root, apply = false } = input;

      let raw: string;
      try {
        raw = await deps.fs.readFile(projectPaths(root).storyboard);
      } catch (error) {
        if (isNotFound(error)) {
          throw new ProjectError("not-found", `no storyboard at ${root}`);
        }
        throw error;
      }

      const storyboard = parseStoryboard(raw);
      const directory = path.join(root, "assets", "generated");

      const ids = await deps.listAssetIds(directory);
      const records = await Promise.all(
        ids.map((id) => deps.readAssetRecord(directory, id)),
      );

      // A file without a readable record is treated as unreferenced but recent:
      // planAssetPrune keeps anything it cannot date, so it survives.
      const assets: AssetRecord[] = records.map((record, index) => {
        const id = ids[index] ?? "";
        return (
          record ?? {
            id,
            mediaType: "application/octet-stream",
            source: "generated",
            createdAt: new Date().toISOString(),
          }
        );
      });

      const plan = planAssetPrune({ storyboard, assets, now: deps.now() });

      if (!apply) {
        return { plan, deleted: [] };
      }

      for (const id of plan.prune) {
        await deps.removeAsset(directory, id);
      }

      return { plan, deleted: plan.prune };
    },
  };
}
