import type { TranscriptDocument } from "@verbal/core";
import { StoryboardError, type Scene } from "./types";

/** The immutable word timeline a storyboard anchors against. */
export type AnchorWord = {
  id: string;
  start: number;
  end: number;
};

export type AnchorIndex = {
  words: AnchorWord[];
};

export type ResolvedScene = {
  startSeconds: number;
  endSeconds: number;
};

/** Builds an anchor index from a transcript document. */
export function anchorIndexFromTranscript(transcript: TranscriptDocument): AnchorIndex {
  return {
    words: transcript.words.map((word) => ({
      id: word.id,
      start: word.start,
      end: word.end,
    })),
  };
}

/**
 * Resolves a scene's word span to a time range.
 *
 * Unknown ids and reversed spans are errors: silently clamping would move a
 * scene without anyone asking for it.
 */
export function resolveScene(scene: Scene, index: AnchorIndex): ResolvedScene {
  const positions = new Map(index.words.map((word, position) => [word.id, position]));

  const startPosition = positions.get(scene.anchor.startWordId);
  const endPosition = positions.get(scene.anchor.endWordId);

  if (startPosition === undefined || endPosition === undefined) {
    throw new StoryboardError(
      "unknown-anchor",
      `unknown anchor: ${scene.anchor.startWordId}..${scene.anchor.endWordId}`,
    );
  }

  if (endPosition < startPosition) {
    throw new StoryboardError(
      "invalid-anchor",
      `reversed anchor: ${scene.anchor.startWordId}..${scene.anchor.endWordId}`,
    );
  }

  const start = index.words[startPosition];
  const end = index.words[endPosition];

  if (start === undefined || end === undefined) {
    throw new StoryboardError(
      "unknown-anchor",
      `unknown anchor: ${scene.anchor.startWordId}..${scene.anchor.endWordId}`,
    );
  }

  return { startSeconds: start.start, endSeconds: end.end };
}
