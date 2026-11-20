import { fileURLToPath } from "node:url";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Workspace package aliases, shared by Vite and Vitest so that tests resolve
 * the same source files the application does.
 */
export const workspaceAliases: Record<string, string> = {
  "@verbal/ai": fromRoot("./packages/ai/src/index.ts"),
  "@verbal/core": fromRoot("./packages/core/src/index.ts"),
  "@verbal/media": fromRoot("./packages/media/src/index.ts"),
  "@verbal/slides": fromRoot("./packages/slides/src/index.ts"),
  "@verbal/storyboard": fromRoot("./packages/storyboard/src/index.ts"),
};
