import { fileURLToPath } from "node:url";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Workspace package aliases, shared by Vite and Vitest so that tests resolve
 * the same source files the application does.
 */
export const workspaceAliases: Record<string, string> = {
  "@verbal/ai": fromRoot("./packages/ai/src/index.ts"),
  "@verbal/cleanup/freeze": fromRoot("./packages/cleanup/src/freeze.ts"),
  "@verbal/cleanup": fromRoot("./packages/cleanup/src/index.ts"),
  "@verbal/compose": fromRoot("./packages/compose/src/index.ts"),
  "@verbal/core": fromRoot("./packages/core/src/index.ts"),
  "@verbal/media/key-quality": fromRoot("./packages/media/src/key-quality.ts"),
  "@verbal/media/presets": fromRoot("./packages/media/src/presets.ts"),
  "@verbal/media": fromRoot("./packages/media/src/index.ts"),
  "@verbal/slides": fromRoot("./packages/slides/src/index.ts"),
  "@verbal/storyboard/hash": fromRoot("./packages/storyboard/src/hash.ts"),
  "@verbal/storyboard": fromRoot("./packages/storyboard/src/index.ts"),
};
