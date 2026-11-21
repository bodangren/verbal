import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  ProjectError,
  nodeFileSystem,
  openProject,
  projectPaths,
  resolveMediaPath,
  type FileSystem,
} from "@verbal/core";
import {
  buildFlatWaveformArgs,
  buildWaveformArgs,
  normaliseWaveform,
  runCommand,
  type WaveformOptions,
} from "@verbal/media";

export type WaveformImage = {
  bytes: Uint8Array;
  cachePath: string;
};

export type WaveformApiDeps = {
  fs: FileSystem;
  stat: (filePath: string) => Promise<{ size: number; mtimeMs: number }>;
  exists: (filePath: string) => Promise<boolean>;
  render: (input: { args: string[] }) => Promise<void>;
  renderFlat: (input: { args: string[] }) => Promise<void>;
  read: (filePath: string) => Promise<Uint8Array>;
  mkdir: (directory: string) => Promise<void>;
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Serves a project's waveform, rendering it once per source revision.
 *
 * The cache key covers the source path, its size, its mtime, and the requested
 * size and colour, so a re-import or a resize draws a new image while an
 * unchanged project costs one `stat` and a file read.
 */
export function createWaveformApi(overrides: Partial<WaveformApiDeps> = {}) {
  const deps: WaveformApiDeps = {
    fs: nodeFileSystem,
    stat: async (filePath) => {
      const info = await stat(filePath);
      return { size: info.size, mtimeMs: info.mtimeMs };
    },
    exists: async (filePath) => {
      try {
        await stat(filePath);
        return true;
      } catch (error) {
        if (isNotFound(error)) {
          return false;
        }
        throw error;
      }
    },
    render: async ({ args }) => {
      // The runner rejects on a non-zero exit, so a failed render surfaces
      // FFmpeg's own message instead of an empty image.
      await runCommand("ffmpeg", args);
    },
    renderFlat: async ({ args }) => {
      await runCommand("ffmpeg", args);
    },
    read: async (filePath) => readFile(filePath),
    mkdir: async (directory) => {
      await mkdir(directory, { recursive: true });
    },
    ...overrides,
  };

  return {
    async image(input: {
      root: string;
      options?: Partial<WaveformOptions>;
    }): Promise<WaveformImage> {
      const project = await openProject(deps.fs, input.root);
      const source = resolveMediaPath(project, input.root);

      if (source === null) {
        throw new ProjectError("not-found", `the project at ${input.root} has no media`);
      }

      const options = normaliseWaveform(input.options);

      let info: { size: number; mtimeMs: number };
      try {
        info = await deps.stat(source);
      } catch (error) {
        if (isNotFound(error)) {
          throw new ProjectError("not-found", `no media file at ${source}`);
        }
        throw error;
      }

      const key = createHash("sha256")
        .update(`${source}:${info.size}:${info.mtimeMs}:${options.width}x${options.height}:${options.color}`)
        .digest("hex")
        .slice(0, 16);

      const directory = projectPaths(input.root).cache;
      const cachePath = path.join(directory, `waveform-${key}.png`);

      if (!(await deps.exists(cachePath))) {
        await deps.mkdir(directory);
        try {
          await deps.render({
            args: buildWaveformArgs({ inputPath: source, outputPath: cachePath, options }),
          });
        } catch (error) {
          // A silent video has no waveform. Draw a flat line so the player
          // still gets a timeline, but keep the original failure in the log.
          console.warn(
            `waveform: no audio in ${source}; drawing a flat line`,
            error instanceof Error ? error.message : error,
          );
          await deps.renderFlat({
            args: buildFlatWaveformArgs({ outputPath: cachePath, options }),
          });
        }
      }

      return { bytes: await deps.read(cachePath), cachePath };
    },
  };
}
