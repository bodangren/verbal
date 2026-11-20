/** Schema version written by this build. Newer versions are refused, not guessed at. */
export const STORYBOARD_SCHEMA_VERSION = 1;

export const VISUAL_KINDS = [
  "talk",
  "slide",
  "static",
  "generated-image",
  "generated-video",
] as const;

export type VisualKind = (typeof VISUAL_KINDS)[number];

export const LAYER_MODES = ["full-frame", "speaker-inset", "side-by-side"] as const;

export type LayerMode = (typeof LAYER_MODES)[number];

/** A scene covers an inclusive span of transcript words. */
export type SceneAnchor = {
  startWordId: string;
  endWordId: string;
};

export type Scene = {
  /** Stable identity. Excluded from the content hash so moving a scene is free. */
  id: string;
  anchor: SceneAnchor;
  visual: VisualKind;
  layer: LayerMode;
  assetId?: string;
  template?: string;
  props?: Record<string, unknown>;
  transition?: string;
};

export type StoryboardDocument = {
  schemaVersion: number;
  scenes: Scene[];
};

export type StoryboardErrorCode =
  | "invalid-json"
  | "unsupported-version"
  | "invalid-document"
  | "unknown-anchor"
  | "invalid-anchor"
  | "unknown-scene"
  | "invalid-patch";

/** Error raised when a storyboard document, anchor, or patch is invalid. */
export class StoryboardError extends Error {
  readonly code: StoryboardErrorCode;

  constructor(code: StoryboardErrorCode, message: string) {
    super(message);
    this.name = "StoryboardError";
    this.code = code;
  }
}

export function isVisualKind(value: unknown): value is VisualKind {
  return typeof value === "string" && (VISUAL_KINDS as readonly string[]).includes(value);
}

export function isLayerMode(value: unknown): value is LayerMode {
  return typeof value === "string" && (LAYER_MODES as readonly string[]).includes(value);
}
