import { StoryboardError, type StoryboardDocument } from "./types";

export type StoryboardVersion = {
  version: number;
  document: StoryboardDocument;
};

export type StoryboardHistory = {
  current(): StoryboardVersion;
  versions(): StoryboardVersion[];
  commit(document: StoryboardDocument): StoryboardVersion;
  revertTo(version: number): StoryboardVersion;
};

/**
 * Append-only storyboard history.
 *
 * Reverting does not truncate: it appends the older document as a new
 * version, so every decision stays auditable and a revert can itself be
 * reverted.
 */
export function createStoryboardHistory(initial: StoryboardDocument): StoryboardHistory {
  let versions: StoryboardVersion[] = [{ version: 1, document: initial }];

  const latest = (): StoryboardVersion => {
    const entry = versions.at(-1);
    if (entry === undefined) {
      throw new StoryboardError("invalid-document", "history is empty");
    }
    return entry;
  };

  return {
    current: latest,

    versions: () => [...versions],

    commit(document) {
      const next: StoryboardVersion = { version: versions.length + 1, document };
      versions = [...versions, next];
      return next;
    },

    revertTo(version) {
      const target = versions.find((entry) => entry.version === version);
      if (target === undefined) {
        throw new StoryboardError("unknown-version", `unknown version: ${version}`);
      }

      const next: StoryboardVersion = {
        version: versions.length + 1,
        document: target.document,
      };
      versions = [...versions, next];
      return next;
    },
  };
}
