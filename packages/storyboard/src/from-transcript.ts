import {
  STORYBOARD_SCHEMA_VERSION,
  type LayerMode,
  type Scene,
  type StoryboardDocument,
  type VisualKind,
} from "./types";

/** The parts of a transcript a first storyboard needs. */
export type StoryboardSeed = {
  words: readonly { id: string }[];
  segments: readonly { id: string; wordIds: readonly string[] }[];
  removedWordIds?: readonly string[];
};

export type StoryboardSeedOptions = {
  visual?: VisualKind;
  layer?: LayerMode;
};

/**
 * Builds a first storyboard from the transcript: one scene per segment.
 *
 * This is the first-run path from a fresh project to a preview. It never
 * anchors to a removed word, drops a segment that has no kept words, and falls
 * back to one scene over the whole take when the transcript has no segments.
 */
export function storyboardFromTranscript(
  seed: StoryboardSeed,
  options: StoryboardSeedOptions = {},
): StoryboardDocument {
  const known = new Set(seed.words.map((word) => word.id));
  const removed = new Set(seed.removedWordIds ?? []);
  const isKept = (id: string) => known.has(id) && !removed.has(id);

  const scenes: Scene[] = [];

  const add = (wordIds: readonly string[]) => {
    const kept = wordIds.filter(isKept);
    const first = kept[0];
    const last = kept[kept.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }

    scenes.push({
      id: `scene-${scenes.length + 1}`,
      anchor: { startWordId: first, endWordId: last },
      visual: options.visual ?? "talk",
      layer: options.layer ?? "full-frame",
    });
  };

  for (const segment of seed.segments) {
    add(segment.wordIds);
  }

  // No segments, or every segment was emptied by removals: one scene is still
  // better than a Deliver screen with nothing to preview.
  if (scenes.length === 0) {
    add(seed.words.map((word) => word.id));
  }

  return { schemaVersion: STORYBOARD_SCHEMA_VERSION, scenes };
}
