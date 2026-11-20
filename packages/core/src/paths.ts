import path from "node:path";
import { ProjectError } from "./errors";

const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;

/**
 * Validates a project-relative path and returns its normalised form.
 *
 * Project documents never store absolute paths, and a relative path may not
 * climb out of the project directory; both would make a project
 * machine-specific or let it reach outside its own root.
 */
export function assertRelativePath(value: string): string {
  if (value.trim() === "") {
    throw new ProjectError("invalid-path", "path is empty");
  }

  if (path.posix.isAbsolute(value) || value.startsWith("\\") || WINDOWS_DRIVE.test(value)) {
    throw new ProjectError("invalid-path", `absolute paths are not allowed: ${value}`);
  }

  const normalised = path.posix.normalize(value);

  if (normalised === ".." || normalised.startsWith("../")) {
    throw new ProjectError("invalid-path", `path points outside the project: ${value}`);
  }

  return normalised;
}

/**
 * Resolves a project-relative path to an absolute path and proves the result
 * stays inside `projectRoot`.
 */
export function resolveInsideProject(projectRoot: string, value: string): string {
  const relative = assertRelativePath(value);
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw new ProjectError("invalid-path", `path points outside the project: ${value}`);
  }

  return resolved;
}
