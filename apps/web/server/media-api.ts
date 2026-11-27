import {
  nodeFileSystem,
  openProject,
  replaceProjectMedia,
  saveProject,
  type FileSystem,
  type MediaRevisionStat,
} from "@verbal/core";
import {
  importMedia as importMediaIntoProject,
  nodeImportFileSystem,
  probeMedia,
  runCommand,
  type ImportFileSystem,
  type ImportMode,
  type ImportResult,
  type MediaInfo,
} from "@verbal/media";
import { failure } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import { asRecord, requireAbsolutePath } from "./validation";
import { stat as statFile } from "node:fs/promises";

export type MediaApiDeps = {
  fs: FileSystem;
  importFs: ImportFileSystem;
  probe: (path: string) => Promise<MediaInfo>;
  importMedia: (
    fs: ImportFileSystem,
    request: { mode: ImportMode; sourcePath: string; projectRoot: string },
  ) => Promise<ImportResult>;
  stat: (path: string) => Promise<MediaRevisionStat>;
};

/** Probing and import endpoints. */
export function createMediaApi(overrides: Partial<MediaApiDeps> = {}) {
  const deps: MediaApiDeps = {
    fs: nodeFileSystem,
    importFs: nodeImportFileSystem,
    probe: (file) => probeMedia(runCommand, file),
    importMedia: (fs, request) => importMediaIntoProject(fs, request),
    stat: async (file) => {
      const info = await statFile(file);
      return { size: info.size, mtimeMs: info.mtimeMs };
    },
    ...overrides,
  };

  return {
    async probe(input: unknown): Promise<ApiResponse> {
      try {
        const file = requireAbsolutePath(asRecord(input).path, "path");
        return { status: 200, body: await deps.probe(file) };
      } catch (error) {
        return failure(error);
      }
    },

    async import(input: unknown): Promise<ApiResponse> {
      try {
        const body = asRecord(input);
        const projectRoot = requireAbsolutePath(body.projectRoot, "projectRoot");
        const sourcePath = requireAbsolutePath(body.sourcePath, "sourcePath");
        const mode: ImportMode = body.mode === "reference" ? "reference" : "copy";

        const project = await openProject(deps.fs, projectRoot);
        const result = await deps.importMedia(deps.importFs, { mode, sourcePath, projectRoot });

        const mediaPath = result.mode === "copy" ? result.absolutePath : result.externalPath;
        const newMedia =
          result.mode === "copy"
            ? { assetPath: result.assetPath }
            : { externalPath: result.externalPath };

        const updated = await replaceProjectMedia(project, newMedia, {
          mediaPath,
          stat: deps.stat,
        });
        await saveProject(deps.fs, projectRoot, updated);

        return { status: 200, body: { project: updated, import: result } };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
