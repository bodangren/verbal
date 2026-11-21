import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectError, projectPaths } from "@verbal/core";

export type FsEntry = {
  name: string;
  path: string;
  isProject: boolean;
};

export type FsListing = {
  path: string;
  /** Null at the filesystem root. */
  parent: string | null;
  entries: FsEntry[];
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function isProject(directory: string): Promise<boolean> {
  try {
    const info = await stat(projectPaths(directory).project);
    return info.isFile();
  } catch {
    return false;
  }
}

/**
 * Lists the subdirectories of one folder so a user can browse to a project.
 *
 * Directories that hold a project.json are flagged, which is what lets the UI
 * offer "open" on a project and "enter" on everything else — no path typing.
 * Local-only by design: the server binds to localhost, and this endpoint exists
 * so the page never needs a native file dialog it cannot use.
 */
export function createFsApi(
  overrides: { home?: () => string; list?: (directory: string) => Promise<FsEntry[]> } = {},
) {
  const home = overrides.home ?? (() => os.homedir());

  const list =
    overrides.list ??
    (async (directory: string): Promise<FsEntry[]> => {
      const dirents = await readdir(directory, { withFileTypes: true });
      const directories = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

      const entries = await Promise.all(
        directories.map(async (name) => {
          const childPath = path.join(directory, name);
          return { name, path: childPath, isProject: await isProject(childPath) };
        }),
      );

      // Projects first, then alphabetical: the thing you came for is at the top.
      return entries.sort((left, right) => {
        if (left.isProject !== right.isProject) {
          return left.isProject ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
    });

  return {
    async listing(requested: string | undefined): Promise<FsListing> {
      const target = requested === undefined || requested.trim() === "" ? home() : requested;

      if (!path.isAbsolute(target)) {
        throw new ProjectError("invalid-path", "path must be an absolute folder");
      }

      let entries: FsEntry[];
      try {
        entries = await list(target);
      } catch (error) {
        if (isNotFound(error)) {
          throw new ProjectError("not-found", `no folder at ${target}`);
        }
        throw error;
      }

      const normalised = path.resolve(target);
      return {
        path: normalised,
        parent: normalised === path.parse(normalised).root ? null : path.dirname(normalised),
        entries,
      };
    },
  };
}
