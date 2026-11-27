import { realpath as nodeRealpath } from "node:fs/promises";
import path from "node:path";
import { ProjectError } from "./errors";
import { assertRelativePath, resolveInsideProject } from "./paths";

/** Resolves a path to its real location. Injected so fake file systems can supply one. */
export type RealpathFn = (value: string) => Promise<string>;

/** Rejects a null byte, then validates the value as a project-relative path. */
export function assertProjectRelativePath(value: string): string {
  if (value.includes("\0")) {
    throw new ProjectError("invalid-path", "path contains a null byte");
  }
  return assertRelativePath(value);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Resolves a project-relative file to its real path and proves that the real
 * path stays inside the canonical project directory.
 *
 * A symlink that points outside the project is rejected, because the check
 * uses the resolved location, not the path as written.
 */
export async function resolveContainedFile(
  projectRoot: string,
  value: string,
  realpath: RealpathFn = nodeRealpath,
): Promise<string> {
  assertProjectRelativePath(value);
  const lexical = resolveInsideProject(projectRoot, value);

  const root = await realpath(path.resolve(projectRoot));
  let target: string;
  try {
    target = await realpath(lexical);
  } catch (error) {
    if (isNotFound(error)) {
      throw new ProjectError("not-found", `file not found: ${value}`);
    }
    throw error;
  }

  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!target.startsWith(prefix)) {
    throw new ProjectError("invalid-path", `path points outside the project: ${value}`);
  }

  return target;
}
