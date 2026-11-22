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
import { ExportError, resolvePreset, withPresetExtension } from "@verbal/media";
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
 * Slides, generated assets, and talk ranges are rendered; a storyboard with
 * none of those is rejected rather than producing an empty video.
 */
export async function startStoryboardExport(
  deps: StartStoryboardExportDeps,
  input: unknown,
): Promise<ApiResponse> {
  try {
    const body = asRecord(input);
    const root = requireAbsolutePath(body.root, "root");
    const requestedOutput = requireAbsolutePath(body.outputPath, "outputPath");
    const preset = resolvePreset(
      typeof body.preset === "string" ? body.preset : undefined,
    );
    if (preset.id === "podcast-audio") {
      return { status: 400, body: { error: "storyboard export needs a video preset" } };
    }
    const outputPath = withPresetExtension(requestedOutput, preset);
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
      // A talk scene is the source video itself: cut the anchored range and
      // let the assembly concatenate it with the rendered slides.
      if (scene.visual === "talk") {
        const times = resolveScene(scene, anchors);
        scenes.set(scene.id, {
          videoRange: {
            input: mediaPath,
            startSeconds: times.startSeconds,
            durationSeconds: times.endSeconds - times.startSeconds,
          },
        });
        resolved.push({
          sceneId: scene.id,
          startSeconds: times.startSeconds,
          endSeconds: times.endSeconds,
        });
        continue;
      }

      if (scene.visual === "slide" && scene.template !== undefined) {
        const times = resolveScene(scene, anchors);
        scenes.set(scene.id, { template: scene.template, props: scene.props ?? {} });
        resolved.push({
          sceneId: scene.id,
          startSeconds: times.startSeconds,
          endSeconds: times.endSeconds,
        });
        continue;
      }

      if (
        (scene.visual === "generated-image" || scene.visual === "generated-video") &&
        scene.assetId !== undefined
      ) {
        const times = resolveScene(scene, anchors);
        scenes.set(scene.id, {
          assetPath: path.join(root, "assets", "generated", scene.assetId),
          assetKind: scene.visual === "generated-video" ? "video" : "image",
        });
        resolved.push({
          sceneId: scene.id,
          startSeconds: times.startSeconds,
          endSeconds: times.endSeconds,
        });
      }
    }

    if (resolved.length === 0) {
      return { status: 400, body: { error: "storyboard has no renderable scenes" } };
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
      codecs: preset.codecs,
    });

    const job = await deps.registry.create("export");

    void runStoryboardExport({
      registry: deps.registry,
      jobId: job.id,
      plan,
      outputPath,
      assemble: async (steps, target, report, signal) => {
        const total = steps.length + 1;

        const renderWithProgress: typeof renderStep = async (step, index) => {
          if (signal.aborted) {
            throw new ExportError("cancelled", "export cancelled");
          }

          report(index / total, `Rendering step ${index + 1} of ${steps.length}`);
          const file = await renderStep(step, index);
          report((index + 1) / total, `Rendered step ${index + 1} of ${steps.length}`);
          return file;
        };

        const result = await assembleStoryboard(
          {
            renderStep: renderWithProgress,
            concat: async (files, out) => {
              if (signal.aborted) {
                throw new ExportError("cancelled", "export cancelled");
              }

              report(steps.length / total, "Concatenating segments");
              const listPath = path.join(workDirectory, "concat.txt");
              await writeFileAtomic(deps.fs, listPath, buildConcatListContent(files));
              await deps.run("ffmpeg", buildConcatArgs(listPath, out));
            },
          },
          steps,
          target,
        );

        report(1, "Export complete");
        return { files: result.files };
      },
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
