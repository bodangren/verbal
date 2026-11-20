import { validateScene } from "./parse";
import { applyPatch, type StoryboardPatch } from "./patches";
import { StoryboardError, type StoryboardDocument } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new StoryboardError("invalid-patch", `${field} must be a non-empty string`);
  }
  return value;
}

function requireIndex(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new StoryboardError("invalid-patch", `${field} must be a non-negative integer`);
  }
  return value;
}

function parseOne(value: unknown, position: number): StoryboardPatch {
  if (!isRecord(value)) {
    throw new StoryboardError("invalid-patch", `patch ${position} must be an object`);
  }

  switch (value.type) {
    case "add":
      if (value.scene === undefined) {
        throw new StoryboardError("invalid-patch", `patch ${position}: add requires a scene`);
      }
      return {
        type: "add",
        scene: validateScene(value.scene),
        index: requireIndex(value.index, "index"),
      };

    case "remove":
      return { type: "remove", sceneId: requireString(value.sceneId, "sceneId") };

    case "move":
      return {
        type: "move",
        sceneId: requireString(value.sceneId, "sceneId"),
        toIndex: requireIndex(value.toIndex, "toIndex"),
      };

    case "replace-asset":
      return {
        type: "replace-asset",
        sceneId: requireString(value.sceneId, "sceneId"),
        assetId: value.assetId === null ? null : requireString(value.assetId, "assetId"),
      };

    case "update-props":
      if (value.props !== null && !isRecord(value.props)) {
        throw new StoryboardError(
          "invalid-patch",
          `patch ${position}: props must be an object or null`,
        );
      }
      return {
        type: "update-props",
        sceneId: requireString(value.sceneId, "sceneId"),
        props: value.props === null ? null : { ...value.props },
      };

    default:
      throw new StoryboardError(
        "invalid-patch",
        `unknown patch type at index ${position}: ${String(value.type)}`,
      );
  }
}

/**
 * Parses an LLM patch response.
 *
 * The model never hands us a document or a timecode: it hands us patches,
 * already in the patch vocabulary. Anything that does not validate is
 * rejected before it can touch a storyboard.
 */
export function parsePatchResponse(raw: string): StoryboardPatch[] {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new StoryboardError("invalid-json", "patch response is not valid JSON");
  }

  if (!isRecord(value) || !Array.isArray(value.patches)) {
    throw new StoryboardError("invalid-document", "patch response must contain a patches array");
  }

  return value.patches.map((entry, index) => parseOne(entry, index));
}

/** Applies patches in order. */
export function applyPatches(
  document: StoryboardDocument,
  patches: readonly StoryboardPatch[],
): StoryboardDocument {
  return patches.reduce((current, patch) => applyPatch(current, patch), document);
}

/** Applies only the hunks the user accepted. */
export function applyAcceptedPatches(
  document: StoryboardDocument,
  patches: readonly StoryboardPatch[],
  accepted: readonly boolean[],
): StoryboardDocument {
  return patches.reduce(
    (current, patch, index) => (accepted[index] === true ? applyPatch(current, patch) : current),
    document,
  );
}

/** One-line description of a patch, used by the review UI. */
export function describePatch(patch: StoryboardPatch): string {
  switch (patch.type) {
    case "add":
      return `Add scene ${patch.scene.id} at position ${patch.index}`;
    case "remove":
      return `Remove scene ${patch.sceneId}`;
    case "move":
      return `Move scene ${patch.sceneId} to position ${patch.toIndex}`;
    case "replace-asset":
      return patch.assetId === null
        ? `Clear the asset on scene ${patch.sceneId}`
        : `Replace the asset on scene ${patch.sceneId} with ${patch.assetId}`;
    case "update-props":
      return `Update props on scene ${patch.sceneId}`;
  }
}
