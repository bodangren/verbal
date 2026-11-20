import path from "node:path";
import type { AssemblyStep } from "./assemble";
import type { SlideCache } from "./cache";
import type { CompositeAudio, CompositeCodecs, CompositeRequest } from "./composite";
import { buildCompositeArgs } from "./composite";
import type { PreviewGeometry } from "./preview";
import { renderSceneSlide } from "./slides";
import type { SlideRenderer } from "./types";

/** Template and props for one scene, or an already-rendered asset. */
export type StepScene = {
  template?: string;
  props?: Record<string, unknown>;
  /** Absolute path to a generated or user asset used as the slide. */
  assetPath?: string;
  /** Image assets loop for the scene duration; video assets are trimmed. */
  assetKind?: "image" | "video";
};

export type RenderStepDeps = {
  renderer: SlideRenderer;
  cache: SlideCache;
  /** Runs ffmpeg; injected so the adapter stays testable. */
  run: (file: string, args: readonly string[]) => Promise<unknown>;
  workDirectory: string;
  geometry: PreviewGeometry;
  speaker: { input: string };
  audio: CompositeAudio;
  scenes: ReadonlyMap<string, StepScene>;
  /** Layout for storyboard scenes; brand steps are always full-frame. */
  sceneLayout?: "speaker-inset" | "side-by-side" | "full-frame";
  codecs?: CompositeCodecs;
};

export type StepAdapterErrorCode = "missing-scene" | "slide-failed";

/** Error raised when one assembly step cannot be produced. */
export class StepAdapterError extends Error {
  readonly code: StepAdapterErrorCode;

  constructor(code: StepAdapterErrorCode, message: string) {
    super(message);
    this.name = "StepAdapterError";
    this.code = code;
  }
}

function slideFor(
  step: AssemblyStep,
  scenes: ReadonlyMap<string, StepScene>,
): { sceneId: string; template: string; props: Record<string, unknown> } {
  if (step.kind === "brand") {
    return {
      sceneId: `brand-${step.role}`,
      template: "title",
      props: {
        title: step.text,
        ...(step.subtitle === undefined ? {} : { subtitle: step.subtitle }),
      },
    };
  }

  const scene = scenes.get(step.sceneId);
  if (scene === undefined) {
    throw new StepAdapterError("missing-scene", `unknown scene: ${step.sceneId}`);
  }
  if (scene.template === undefined) {
    throw new StepAdapterError(
      "missing-scene",
      `scene ${step.sceneId} has neither a template nor an asset`,
    );
  }

  return { sceneId: step.sceneId, template: scene.template, props: scene.props ?? {} };
}

/**
 * Builds the concrete step renderer used by assembly.
 *
 * Brand steps render a Remotion title full-frame; storyboard scenes render
 * their template and composite the keyed speaker over it. Slides go through
 * the content-addressed cache, so repeat exports reuse frames.
 */
export function createStepRenderer(deps: RenderStepDeps): (step: AssemblyStep, index: number) => Promise<string> {
  return async (step, index) => {
    const outputPath = path.join(
      deps.workDirectory,
      `step-${String(index).padStart(3, "0")}.mp4`,
    );

    const scene = step.kind === "scene" ? deps.scenes.get(step.sceneId) : undefined;

    if (step.kind === "scene" && scene === undefined) {
      throw new StepAdapterError("missing-scene", `unknown scene: ${step.sceneId}`);
    }

    // An asset-backed scene skips the renderer entirely: the image already
    // exists, so it only needs the composite.
    if (scene?.assetPath !== undefined) {
      const assetRequest: CompositeRequest = {
        outputPath,
        width: deps.geometry.width,
        height: deps.geometry.height,
        fps: deps.geometry.fps,
        durationSeconds: step.durationSeconds,
        layout: deps.sceneLayout ?? "speaker-inset",
        slide:
          scene.assetKind === "video"
            ? { input: scene.assetPath }
            : { input: scene.assetPath, loop: true },
        speaker: { input: deps.speaker.input },
        key: {},
        audio: deps.audio,
        ...(deps.codecs === undefined ? {} : { codecs: deps.codecs }),
      };

      await deps.run("ffmpeg", buildCompositeArgs(assetRequest));
      return outputPath;
    }

    const slide = slideFor(step, deps.scenes);

    const outcome = await renderSceneSlide(
      { renderer: deps.renderer, cache: deps.cache },
      {
        sceneId: slide.sceneId,
        template: slide.template,
        props: slide.props,
        durationSeconds: step.durationSeconds,
        fps: deps.geometry.fps,
        width: deps.geometry.width,
        height: deps.geometry.height,
      },
    );

    if (outcome.status !== "rendered") {
      throw new StepAdapterError(
        "slide-failed",
        `step ${index} (${step.kind}) failed to render: ${outcome.error}`,
      );
    }

    const request: CompositeRequest = {
      outputPath,
      width: deps.geometry.width,
      height: deps.geometry.height,
      fps: deps.geometry.fps,
      durationSeconds: step.durationSeconds,
      layout: step.kind === "brand" ? "full-frame" : (deps.sceneLayout ?? "speaker-inset"),
      slide: {
        input: path.join(outcome.directory, outcome.manifest.pattern),
        frameRate: outcome.manifest.fps,
      },
      speaker: { input: deps.speaker.input },
      key: {},
      audio: deps.audio,
      ...(deps.codecs === undefined ? {} : { codecs: deps.codecs }),
    };

    await deps.run("ffmpeg", buildCompositeArgs(request));

    return outputPath;
  };
}
