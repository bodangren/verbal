import { existsSync } from "node:fs";
import path from "node:path";
import {
  createProcessRenderer,
  nodeProcessRunner,
  type SlideRenderer,
} from "@verbal/compose";

/** Locates the Remotion renderer relative to the server's working directory. */
export function resolveRendererPath(): string {
  const fromEnv = process.env.VERBAL_REMOTION_RENDERER;
  if (fromEnv !== undefined && fromEnv !== "") {
    return path.resolve(fromEnv);
  }

  const candidates = [
    path.resolve("tools/remotion/render.mjs"),
    path.resolve("../../tools/remotion/render.mjs"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

/** Checks for the Remotion bundler installed beside the renderer file. */
export function rendererDependenciesInstalled(
  rendererPath: string,
  exists: (p: string) => boolean,
): boolean {
  return exists(
    path.join(path.dirname(rendererPath), "node_modules", "@remotion", "bundler"),
  );
}

/** Production slide renderer: a Node child process running `render.mjs`. */
export function createStoryboardRenderer(): SlideRenderer {
  return createProcessRenderer({
    command: process.execPath,
    args: [resolveRendererPath()],
    run: nodeProcessRunner,
    timeoutMs: 300_000,
  });
}
