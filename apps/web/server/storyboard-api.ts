import path from "node:path";
import {
  nodeFileSystem,
  openProject,
  parseTranscript,
  projectPaths,
  resolveInsideProject,
  writeFileAtomic,
  ProjectError,
  type FileSystem,
  type JobRegistry,
  type TranscriptDocument,
} from "@verbal/core";
import {
  STORYBOARD_SCHEMA_VERSION,
  anchorIndexFromTranscript,
  parseStoryboard,
  resolveScene,
  serializeStoryboard,
  validateStoryboard,
  type StoryboardDocument,
} from "@verbal/storyboard";
import {
  assembleStoryboard,
  audioFromBrand,
  buildConcatArgs,
  buildConcatListContent,
  buildProvenanceManifest,
  createFileSlideCache,
  createStepRenderer,
  planAssembly,
  planPreview,
  serializeProvenance,
  validateBrandKit,
  type PreviewGeometry,
  type PreviewTier,
  type SlideRenderer,
  type StepScene,
} from "@verbal/compose";
import { failure } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import { runStoryboardExport } from "./storyboard-export";
import { asRecord, requireAbsolutePath } from "./validation";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Reads `storyboard.json`, treating a missing file as an empty storyboard. */
export async function readStoryboard(
  fs: FileSystem,
  root: string,
): Promise<StoryboardDocument> {
  try {
    return parseStoryboard(await fs.readFile(projectPaths(root).storyboard));
  } catch (error) {
    if (isNotFound(error)) {
      return { schemaVersion: STORYBOARD_SCHEMA_VERSION, scenes: [] };
    }
    throw error;
  }
}

function parseGeometry(value: unknown): PreviewGeometry {
  const record = asRecord(value);
  const fps = typeof record.fps === "number" && record.fps > 0 ? record.fps : 30;
  const width = typeof record.width === "number" && record.width >= 2 ? record.width : 1920;
  const height = typeof record.height === "number" && record.height >= 2 ? record.height : 1080;
  return { fps, width, height };
}

async function readTranscriptDocument(
  fs: FileSystem,
  root: string,
): Promise<TranscriptDocument> {
  try {
    return parseTranscript(await fs.readFile(projectPaths(root).transcript));
  } catch (error) {
    if (isNotFound(error)) {
      throw new ProjectError("not-found", `no transcript at ${root}`);
    }
    throw error;
  }
}

export type StoryboardApiDeps = {
  fs: FileSystem;
};

/** Storyboard document and preview endpoints. */
export function createStoryboardApi(overrides: Partial<StoryboardApiDeps> = {}) {
  const fs = overrides.fs ?? nodeFileSystem;

  return {
    async load(input: unknown): Promise<ApiResponse> {
      try {
        const root = requireAbsolutePath(asRecord(input).root, "root");
        return { status: 200, body: await readStoryboard(fs, root) };
      } catch (error) {
        return failure(error);
      }
    },

    async save(input: unknown): Promise<ApiResponse> {
      try {
        const body = asRecord(input);
        const root = requireAbsolutePath(body.root, "root");
        const document = validateStoryboard(body.document);
        await writeFileAtomic(
          fs,
          projectPaths(root).storyboard,
          serializeStoryboard(document),
        );
        return { status: 200, body: document };
      } catch (error) {
        return failure(error);
      }
    },

    async preview(input: unknown): Promise<ApiResponse> {
      try {
        const body = asRecord(input);
        const root = requireAbsolutePath(body.root, "root");
        const tier: PreviewTier = body.tier === "full" ? "full" : "fast";
        const version =
          typeof body.version === "number" && Number.isInteger(body.version)
            ? body.version
            : 1;

        const transcript = await readTranscriptDocument(fs, root);
        const storyboard = await readStoryboard(fs, root);
        const cache = createFileSlideCache(fs, path.join(root, "cache", "slides"));

        const plan = await planPreview({
          storyboard,
          anchors: anchorIndexFromTranscript(transcript),
          cache,
          tier,
          version,
          geometry: parseGeometry(body.geometry),
        });

        return { status: 200, body: plan };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export type StartStoryboardExportDeps = {
  fs: FileSystem;
  registry: JobRegistry;
  renderer: SlideRenderer;
  run: (file: string, args: readonly string[]) => Promise<unknown>;
  now: () => Date;
};

/**
 * Starts a storyboard export as a job.
 *
 * Only slide scenes are rendered; a storyboard with none is rejected rather
 * than producing an empty video.
 */
export async function startStoryboardExport(
  deps: StartStoryboardExportDeps,
  input: unknown,
): Promise<ApiResponse> {
  try {
    const body = asRecord(input);
    const root = requireAbsolutePath(body.root, "root");
    const outputPath = requireAbsolutePath(body.outputPath, "outputPath");
    const brand = validateBrandKit(body.brand);
    const geometry = parseGeometry(body.geometry);

    const project = await openProject(deps.fs, root);
    const mediaPath =
      project.media?.assetPath !== undefined
        ? resolveInsideProject(root, project.media.assetPath)
        : project.media?.externalPath;

    if (mediaPath === undefined) {
      return { status: 400, body: { error: "project has no media" } };
    }

    const transcript = await readTranscriptDocument(deps.fs, root);
    const storyboard = await readStoryboard(deps.fs, root);
    const anchors = anchorIndexFromTranscript(transcript);

    const scenes = new Map<string, StepScene>();
    const resolved: { sceneId: string; startSeconds: number; endSeconds: number }[] = [];

    for (const scene of storyboard.scenes) {
      if (scene.visual !== "slide" || scene.template === undefined) {
        continue;
      }
      const times = resolveScene(scene, anchors);
      scenes.set(scene.id, { template: scene.template, props: scene.props ?? {} });
      resolved.push({
        sceneId: scene.id,
        startSeconds: times.startSeconds,
        endSeconds: times.endSeconds,
      });
    }

    if (resolved.length === 0) {
      return { status: 400, body: { error: "storyboard has no slide scenes to render" } };
    }

    const plan = planAssembly({ scenes: resolved, brand });
    const cache = createFileSlideCache(deps.fs, path.join(root, "cache", "slides"));
    const workDirectory = path.join(root, "cache", "assembly");
    await deps.fs.mkdir(workDirectory);

    const renderStep = createStepRenderer({
      renderer: deps.renderer,
      cache,
      run: deps.run,
      workDirectory,
      geometry,
      speaker: { input: mediaPath },
      audio: audioFromBrand(brand),
      scenes,
    });

    const job = await deps.registry.create("export");

    void runStoryboardExport({
      registry: deps.registry,
      jobId: job.id,
      plan,
      outputPath,
      assemble: async (steps, target) =>
        assembleStoryboard(
          {
            renderStep,
            concat: async (files, out) => {
              const listPath = path.join(workDirectory, "concat.txt");
              await writeFileAtomic(deps.fs, listPath, buildConcatListContent(files));
              await deps.run("ffmpeg", buildConcatArgs(listPath, out));
            },
          },
          steps,
          target,
        ),
      writeProvenance: async (out) => {
        const manifest = buildProvenanceManifest({
          createdAt: deps.now().toISOString(),
          outputPath: out,
          brandKit: brand,
          scenes: [...scenes.entries()].map(([sceneId, scene]) => ({
            sceneId,
            template: scene.template,
          })),
        });
        const manifestPath = `${out}.provenance.json`;
        await writeFileAtomic(deps.fs, manifestPath, serializeProvenance(manifest));
        return manifestPath;
      },
    });

    return { status: 202, body: job };
  } catch (error) {
    return failure(error);
  }
}
