import {
  STORYBOARD_SCHEMA_VERSION,
  StoryboardError,
  isLayerMode,
  isVisualKind,
  type Scene,
  type StoryboardDocument,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new StoryboardError("invalid-document", `${field} must be a non-empty string`);
  }
  return value;
}

function parseScene(value: unknown, seenIds: Set<string>): Scene {
  if (!isRecord(value)) {
    throw new StoryboardError("invalid-document", "scene must be an object");
  }

  const id = nonEmptyString(value.id, "scene id");
  if (seenIds.has(id)) {
    throw new StoryboardError("invalid-document", `duplicate scene id: ${id}`);
  }
  seenIds.add(id);

  if (!isRecord(value.anchor)) {
    throw new StoryboardError("invalid-document", `scene ${id}: anchor must be an object`);
  }

  const anchor = {
    startWordId: nonEmptyString(value.anchor.startWordId, "anchor.startWordId"),
    endWordId: nonEmptyString(value.anchor.endWordId, "anchor.endWordId"),
  };

  if (!isVisualKind(value.visual)) {
    throw new StoryboardError("invalid-document", `scene ${id}: unknown visual kind`);
  }
  if (!isLayerMode(value.layer)) {
    throw new StoryboardError("invalid-document", `scene ${id}: unknown layer mode`);
  }

  const scene: Scene = {
    id,
    anchor,
    visual: value.visual,
    layer: value.layer,
  };

  if (value.assetId !== undefined && value.assetId !== null) {
    scene.assetId = nonEmptyString(value.assetId, "assetId");
  }
  if (value.template !== undefined && value.template !== null) {
    scene.template = nonEmptyString(value.template, "template");
  }
  if (value.transition !== undefined && value.transition !== null) {
    scene.transition = nonEmptyString(value.transition, "transition");
  }
  if (value.props !== undefined && value.props !== null) {
    if (!isRecord(value.props)) {
      throw new StoryboardError("invalid-document", `scene ${id}: props must be an object`);
    }
    scene.props = { ...value.props };
  }

  const needsAsset = scene.visual === "static";

  if (needsAsset && scene.assetId === undefined) {
    throw new StoryboardError(
      "invalid-document",
      `scene ${id}: ${scene.visual} requires an assetId`,
    );
  }

  if (scene.visual === "slide" && scene.assetId === undefined && scene.template === undefined) {
    throw new StoryboardError(
      "invalid-document",
      `scene ${id}: slide requires a template or an assetId`,
    );
  }

  return scene;
}

/** Validates one untrusted scene value. */
export function validateScene(value: unknown): Scene {
  return parseScene(value, new Set());
}

/** Validates an untrusted value and returns a typed storyboard document. */
export function validateStoryboard(value: unknown): StoryboardDocument {
  if (!isRecord(value)) {
    throw new StoryboardError("invalid-document", "storyboard must be an object");
  }

  const { schemaVersion, scenes } = value;

  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    throw new StoryboardError("invalid-document", "schemaVersion must be an integer");
  }
  if (schemaVersion > STORYBOARD_SCHEMA_VERSION) {
    throw new StoryboardError(
      "unsupported-version",
      `storyboard schemaVersion ${schemaVersion} is newer than supported version ${STORYBOARD_SCHEMA_VERSION}`,
    );
  }
  if (schemaVersion < 1) {
    throw new StoryboardError("invalid-document", "schemaVersion must be at least 1");
  }
  if (!Array.isArray(scenes)) {
    throw new StoryboardError("invalid-document", "scenes must be an array");
  }

  const seenIds = new Set<string>();

  return {
    schemaVersion,
    scenes: scenes.map((scene) => parseScene(scene, seenIds)),
  };
}

/** Parses and validates a storyboard document. */
export function parseStoryboard(raw: string): StoryboardDocument {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new StoryboardError("invalid-json", "storyboard is not valid JSON");
  }

  return validateStoryboard(value);
}

/** Serialises a storyboard with a stable, diff-friendly layout. */
export function serializeStoryboard(document: StoryboardDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
