import { StoryboardError, type Scene, type StoryboardDocument } from "./types";

/** A reversible change to a storyboard document. */
export type StoryboardPatch =
  | { type: "add"; scene: Scene; index: number }
  | { type: "remove"; sceneId: string }
  | { type: "move"; sceneId: string; toIndex: number }
  | { type: "replace-asset"; sceneId: string; assetId: string | null }
  | { type: "update-props"; sceneId: string; props: Record<string, unknown> | null };

function indexOfScene(document: StoryboardDocument, sceneId: string): number {
  const index = document.scenes.findIndex((scene) => scene.id === sceneId);
  if (index === -1) {
    throw new StoryboardError("unknown-scene", `unknown scene: ${sceneId}`);
  }
  return index;
}

function replaceAt(scenes: readonly Scene[], index: number, scene: Scene): Scene[] {
  return [...scenes.slice(0, index), scene, ...scenes.slice(index + 1)];
}

/** Applies a patch, returning a new document. */
export function applyPatch(
  document: StoryboardDocument,
  patch: StoryboardPatch,
): StoryboardDocument {
  const scenes = document.scenes;

  switch (patch.type) {
    case "add": {
      if (!Number.isInteger(patch.index) || patch.index < 0 || patch.index > scenes.length) {
        throw new StoryboardError(
          "invalid-patch",
          `add index ${patch.index} is out of range 0..${scenes.length}`,
        );
      }
      if (scenes.some((scene) => scene.id === patch.scene.id)) {
        throw new StoryboardError("invalid-patch", `duplicate scene id: ${patch.scene.id}`);
      }
      return {
        ...document,
        scenes: [
          ...scenes.slice(0, patch.index),
          patch.scene,
          ...scenes.slice(patch.index),
        ],
      };
    }

    case "remove": {
      const index = indexOfScene(document, patch.sceneId);
      return { ...document, scenes: scenes.filter((_, position) => position !== index) };
    }

    case "move": {
      const index = indexOfScene(document, patch.sceneId);
      if (
        !Number.isInteger(patch.toIndex) ||
        patch.toIndex < 0 ||
        patch.toIndex >= scenes.length
      ) {
        throw new StoryboardError(
          "invalid-patch",
          `move index ${patch.toIndex} is out of range 0..${scenes.length - 1}`,
        );
      }

      const scene = scenes[index];
      if (scene === undefined) {
        throw new StoryboardError("unknown-scene", `unknown scene: ${patch.sceneId}`);
      }

      const without = scenes.filter((_, position) => position !== index);
      return {
        ...document,
        scenes: [
          ...without.slice(0, patch.toIndex),
          scene,
          ...without.slice(patch.toIndex),
        ],
      };
    }

    case "replace-asset": {
      const index = indexOfScene(document, patch.sceneId);
      const current = scenes[index];
      if (current === undefined) {
        throw new StoryboardError("unknown-scene", `unknown scene: ${patch.sceneId}`);
      }

      const next: Scene = { ...current };
      if (patch.assetId === null) {
        delete next.assetId;
      } else {
        next.assetId = patch.assetId;
      }

      return { ...document, scenes: replaceAt(scenes, index, next) };
    }

    case "update-props": {
      const index = indexOfScene(document, patch.sceneId);
      const current = scenes[index];
      if (current === undefined) {
        throw new StoryboardError("unknown-scene", `unknown scene: ${patch.sceneId}`);
      }

      const next: Scene = { ...current };
      if (patch.props === null) {
        delete next.props;
      } else {
        next.props = { ...patch.props };
      }

      return { ...document, scenes: replaceAt(scenes, index, next) };
    }
  }
}

/**
 * Builds the patch that undoes `patch` when applied to the resulting document.
 *
 * The inverse is computed from the document *before* the patch, so removal
 * and overwrite operations can restore the exact previous value.
 */
export function invertPatch(
  before: StoryboardDocument,
  patch: StoryboardPatch,
): StoryboardPatch {
  switch (patch.type) {
    case "add":
      return { type: "remove", sceneId: patch.scene.id };

    case "remove": {
      const index = indexOfScene(before, patch.sceneId);
      const scene = before.scenes[index];
      if (scene === undefined) {
        throw new StoryboardError("unknown-scene", `unknown scene: ${patch.sceneId}`);
      }
      return { type: "add", scene, index };
    }

    case "move": {
      const index = indexOfScene(before, patch.sceneId);
      return { type: "move", sceneId: patch.sceneId, toIndex: index };
    }

    case "replace-asset": {
      const index = indexOfScene(before, patch.sceneId);
      return {
        type: "replace-asset",
        sceneId: patch.sceneId,
        assetId: before.scenes[index]?.assetId ?? null,
      };
    }

    case "update-props": {
      const index = indexOfScene(before, patch.sceneId);
      return {
        type: "update-props",
        sceneId: patch.sceneId,
        props: before.scenes[index]?.props ?? null,
      };
    }
  }
}
