import { createHash } from "node:crypto";
import type { Scene } from "./types";

/** Canonical JSON: object keys sorted, undefined values dropped. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();

  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

/**
 * Content hash for a scene's render.
 *
 * The scene id is deliberately excluded: renaming or reordering a scene must
 * not invalidate its cached frames. Duration is included when known, because
 * a longer scene is a different render.
 */
export function hashScene(scene: Scene, durationSeconds?: number): string {
  const content = { ...scene } as Record<string, unknown>;
  delete content.id;

  const payload =
    durationSeconds === undefined ? content : { ...content, durationSeconds };

  return createHash("sha256").update(canonical(payload)).digest("hex");
}
