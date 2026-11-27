import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  mediaRevisionMismatch,
  nodeFileSystem,
  openProject,
  parseTranscript,
  projectPaths,
  resolveContainedFile,
  resolveInsideProject,
  writeFileAtomic,
  ProjectError,
  type FileSystem,
  type JobRegistry,
  type RealpathFn,
  type TranscriptDocument,
} from "@verbal/core";
import {
  STORYBOARD_SCHEMA_VERSION,
  StoryboardError,
  anchorIndexFromTranscript,
  parseStoryboard,
  resolveScene,
  serializeStoryboard,
  validateStoryboard,
  type Scene,
  type StoryboardDocument,
  type VisualKind,
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
  type BrandKit,
  type PreviewGeometry,
  type PreviewTier,
  type SlideRenderer,
  type StepScene,
} from "@verbal/compose";
import {
  ExportError,
  probeMedia,
  resolveExportDestination,
  resolvePreset,
  runCommand,
  withPresetExtension,
  type MediaInfo,
} from "@verbal/media";
import { failure, messageOf } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import {
  rendererDependenciesInstalled,
  resolveRendererPath,
} from "./remotion-renderer";
import { runStoryboardExport } from "./storyboard-export";
import { computeTalkItems } from "./talk-ranges";
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

        // A talk scene plays its kept words plus inserted silence, so the
        // list shows what the export will contain, not the source span.
        const scenes = plan.scenes.map((entry) => {
          const scene = storyboard.scenes.find((candidate) => candidate.id === entry.sceneId);
          if (scene === undefined || scene.visual !== "talk") {
            return entry;
          }
          const items = computeTalkItems({
            transcript,
            startWordId: scene.anchor.startWordId,
            endWordId: scene.anchor.endWordId,
          });
          const playSeconds = items.reduce(
            (sum, item) =>
              sum +
              (item.kind === "silence"
                ? item.durationSeconds
                : item.endSeconds - item.startSeconds),
            0,
          );
          return { ...entry, playSeconds: Math.round(playSeconds * 1000) / 1000 };
        });

        return { status: 200, body: { ...plan, scenes } };
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
  rendererReady?: () => boolean;
  /** Removes a job's private work directory. Defaults to a recursive remove. */
  removeDirectory?: (directory: string) => Promise<void>;
  /** Resolves asset and music files to their real paths. Defaults to `fs.realpath`. */
  realpath?: RealpathFn;
  /** Reads a source's streams. Defaults to ffprobe. */
  probe?: (file: string) => Promise<MediaInfo>;
};

/** Reports whether a source has an audio stream. A failed probe counts as audio. */
async function sourceHasAudio(
  probe: (file: string) => Promise<MediaInfo>,
  file: string,
): Promise<boolean> {
  try {
    return (await probe(file)).streams.some((stream) => stream.kind === "audio");
  } catch {
    return true;
  }
}

/** Scene kinds the export renders. Add a kind here only after its export branch exists. */
export const EXPORTABLE_VISUAL_KINDS: readonly VisualKind[] = [
  "talk",
  "slide",
  "generated-image",
  "generated-video",
];

/**
 * Throws when the export cannot render a scene.
 *
 * A slide renders from its template. A generated scene renders from its asset.
 */
export function assertExportable(scene: Scene): void {
  if (!EXPORTABLE_VISUAL_KINDS.includes(scene.visual)) {
    throw new StoryboardError(
      "invalid-document",
      `scene ${scene.id}: ${scene.visual} scenes cannot be exported`,
    );
  }
  if (scene.visual === "slide" && scene.template === undefined) {
    throw new StoryboardError(
      "invalid-document",
      `scene ${scene.id}: a slide needs a template to be exported`,
    );
  }
  if (
    (scene.visual === "generated-image" || scene.visual === "generated-video") &&
    scene.assetId === undefined
  ) {
    throw new StoryboardError(
      "invalid-document",
      `scene ${scene.id}: ${scene.visual} needs an assetId to be exported`,
    );
  }
}

/**
 * Starts a storyboard export as a job.
 *
 * Slides, generated assets, and talk ranges are rendered. A storyboard with
 * an unsupported scene is rejected before the job starts, and so is one with
 * no renderable scenes.
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
    if (body.includeBrand !== undefined && typeof body.includeBrand !== "boolean") {
      return { status: 400, body: { error: "includeBrand must be a boolean" } };
    }
    const outputPath = withPresetExtension(requestedOutput, preset);
    let brand: BrandKit;
    try {
      brand = validateBrandKit(body.brand);
    } catch (error) {
      return { status: 400, body: { error: messageOf(error) } };
    }
    const geometry = parseGeometry(body.geometry);

    const project = await openProject(deps.fs, root);
    const mediaPath =
      project.media?.assetPath !== undefined
        ? resolveInsideProject(root, project.media.assetPath)
        : project.media?.externalPath;

    if (mediaPath === undefined) {
      return { status: 400, body: { error: "project has no media" } };
    }
    try {
      await resolveExportDestination(mediaPath, outputPath, deps.realpath);
    } catch (error) {
      if (error instanceof Error && error.message === "outputPath must not be the source video") {
        return { status: 400, body: { error: error.message } };
      }
      return failure(error);
    }

    const transcript = await readTranscriptDocument(deps.fs, root);
    if (mediaRevisionMismatch(project.media?.mediaRevision, transcript.mediaRevision)) {
      return {
        status: 409,
        body: { error: "The transcript belongs to different media. Transcribe again." },
      };
    }
    const storyboard = await readStoryboard(deps.fs, root);
    for (const scene of storyboard.scenes) {
      assertExportable(scene);
    }
    const anchors = anchorIndexFromTranscript(transcript);
    const audioBrand =
      brand.music === undefined
        ? brand
        : {
            ...brand,
            music: {
              ...brand.music,
              assetPath: await resolveContainedFile(root, brand.music.assetPath, deps.realpath),
            },
          };

    const scenes = new Map<string, StepScene>();
    const resolved: { sceneId: string; startSeconds: number; endSeconds: number }[] = [];

    for (const scene of storyboard.scenes) {
      // A talk scene is the source video itself: cut the anchored range and
      // let the assembly concatenate it with the rendered slides.
      if (scene.visual === "talk") {
        const items = computeTalkItems({
          transcript,
          startWordId: scene.anchor.startWordId,
          endWordId: scene.anchor.endWordId,
        });

        items.forEach((item, index) => {
          const sceneId = items.length === 1 ? scene.id : `${scene.id}#${index + 1}`;
          if (item.kind === "silence") {
            scenes.set(sceneId, { silence: true });
            resolved.push({
              sceneId,
              startSeconds: 0,
              endSeconds: item.durationSeconds,
            });
            return;
          }
          scenes.set(sceneId, {
            videoRange: {
              input: mediaPath,
              startSeconds: item.startSeconds,
              durationSeconds: item.endSeconds - item.startSeconds,
            },
          });
          resolved.push({
            sceneId,
            startSeconds: item.startSeconds,
            endSeconds: item.endSeconds,
          });
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
        const assetPath = await resolveContainedFile(
          root,
          `assets/generated/${scene.assetId}`,
          deps.realpath,
        );
        scenes.set(scene.id, {
          assetPath,
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

    const plan = planAssembly({
      scenes: resolved,
      brand,
      includeBrand: body.includeBrand !== false,
    });
    const needsRenderer = plan.some((step) => {
      if (step.kind === "brand") {
        return true;
      }
      const scene = scenes.get(step.sceneId);
      return scene?.silence !== true && scene?.videoRange === undefined;
    });
    const rendererReady =
      deps.rendererReady ??
      (() => rendererDependenciesInstalled(resolveRendererPath(), existsSync));

    if (needsRenderer && !rendererReady()) {
      return {
        status: 503,
        body: {
          error:
            "Cannot find package '@remotion/bundler': the slide renderer is not installed in tools/remotion",
        },
      };
    }

    const cache = createFileSlideCache(deps.fs, path.join(root, "cache", "slides"));
    const probe = deps.probe ?? ((file: string) => probeMedia(runCommand, file));
    const hasAudio = await sourceHasAudio(probe, mediaPath);

    const job = await deps.registry.create("export");
    const workDirectory = path.join(root, "cache", "assembly", job.id);
    const removeDirectory =
      deps.removeDirectory ??
      ((directory: string) => rm(directory, { recursive: true, force: true }));

    const renderStep = createStepRenderer({
      renderer: deps.renderer,
      cache,
      run: deps.run,
      workDirectory,
      geometry,
      speaker: { input: mediaPath, hasAudio },
      audio: audioFromBrand(audioBrand),
      scenes,
      codecs: preset.codecs,
    });

    void runStoryboardExport({
      registry: deps.registry,
      jobId: job.id,
      plan,
      outputPath,
      rename: (from, to) => deps.fs.rename(from, to),
      unlink: (path) => deps.fs.unlink(path),
      assemble: async (steps, target, report, signal) => {
        await deps.fs.mkdir(workDirectory);
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
    }).finally(async () => {
      await removeDirectory(workDirectory).catch(() => undefined);
    });

    return { status: 202, body: job };
  } catch (error) {
    return failure(error);
  }
}
