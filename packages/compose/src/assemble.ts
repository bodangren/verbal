import type { BrandKit } from "./brand";

export type AssemblyStep =
  | { kind: "scene"; sceneId: string; durationSeconds: number }
  | {
      kind: "brand";
      role: "title" | "outro";
      durationSeconds: number;
      text: string;
      subtitle?: string;
    };

export type AssemblyErrorCode = "empty-plan" | "invalid-plan";

/** Error raised when an assembly plan cannot be built or executed. */
export class AssemblyError extends Error {
  readonly code: AssemblyErrorCode;

  constructor(code: AssemblyErrorCode, message: string) {
    super(message);
    this.name = "AssemblyError";
    this.code = code;
  }
}

export type AssemblySceneInput = {
  sceneId: string;
  startSeconds: number;
  endSeconds: number;
};

export type PlanAssemblyInput = {
  scenes: readonly AssemblySceneInput[];
  brand: BrandKit;
  titleDurationSeconds?: number;
  outroDurationSeconds?: number;
  /** Set false to preview scenes without the brand bookends. */
  includeBrand?: boolean;
};

/** Joins the non-empty parts of a contact card. */
function formatContact(contact: BrandKit["contact"]): string | undefined {
  const parts = [contact.name, contact.handle, contact.url].filter(
    (part): part is string => part !== undefined && part.trim() !== "",
  );
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Orders the pieces of the final video: title, scenes, outro.
 *
 * Brand text travels with the steps, so a renderer never has to look the
 * brand kit up again. The contact card rides on the outro.
 */
export function planAssembly(input: PlanAssemblyInput): AssemblyStep[] {
  const steps: AssemblyStep[] = [];

  if (input.includeBrand !== false) {
    steps.push({
      kind: "brand",
      role: "title",
      durationSeconds: input.titleDurationSeconds ?? 3,
      text: input.brand.title.text,
      ...(input.brand.title.subtitle === undefined
        ? {}
        : { subtitle: input.brand.title.subtitle }),
    });
  }

  for (const scene of input.scenes) {
    const duration = scene.endSeconds - scene.startSeconds;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new AssemblyError(
        "invalid-plan",
        `scene ${scene.sceneId} has a non-positive duration`,
      );
    }
    steps.push({ kind: "scene", sceneId: scene.sceneId, durationSeconds: duration });
  }

  if (input.includeBrand !== false) {
    const subtitleParts = [
      input.brand.outro.subtitle,
      formatContact(input.brand.contact),
    ].filter((part): part is string => part !== undefined && part.trim() !== "");

    steps.push({
      kind: "brand",
      role: "outro",
      durationSeconds: input.outroDurationSeconds ?? 3,
      text: input.brand.outro.text,
      ...(subtitleParts.length === 0 ? {} : { subtitle: subtitleParts.join(" · ") }),
    });
  }

  return steps;
}

/** Concat-demuxer list; single quotes are escaped per its parser. */
export function buildConcatListContent(files: readonly string[]): string {
  return `${files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n")}\n`;
}

/** Concatenates identical-codec segment files without re-encoding. */
export function buildConcatArgs(listPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath,
  ];
}

export type AssemblyDeps = {
  /** Renders one step to a segment file and returns its path. */
  renderStep: (step: AssemblyStep, index: number) => Promise<string>;
  concat: (files: readonly string[], outputPath: string) => Promise<void>;
};

export type AssemblyResult = {
  files: string[];
  outputPath: string;
};

/**
 * Executes an assembly plan.
 *
 * Steps are rendered in order, then concatenated. Nothing is concatenated if
 * a step fails, so a partial sequence never looks like a finished video.
 */
export async function assembleStoryboard(
  deps: AssemblyDeps,
  plan: readonly AssemblyStep[],
  outputPath: string,
): Promise<AssemblyResult> {
  if (plan.length === 0) {
    throw new AssemblyError("empty-plan", "assembly needs at least one step");
  }

  const files: string[] = [];

  for (const [index, step] of plan.entries()) {
    files.push(await deps.renderStep(step, index));
  }

  await deps.concat(files, outputPath);

  return { files, outputPath };
}
