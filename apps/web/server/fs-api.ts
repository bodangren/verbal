import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseProjectDocument,
  parseTranscript,
  ProjectError,
  projectPaths,
} from "@verbal/core";

/** What a project row shows without opening it. */
export type FsEntrySummary = {
  /** Name from project.json, which can differ from the folder name. */
  name: string;
  transcriptWords: number;
  hasMedia: boolean;
  createdAt: string;
};

export type FsEntry = {
  name: string;
  path: string;
  isProject: boolean;
  summary?: FsEntrySummary;
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

/**
 * Reads a folder's project metadata, or null when it is not a project.
 *
 * The summary is best-effort: a damaged transcript costs the word count, not
 * the row, because the project is still openable and transcribable.
 */
async function summariseProject(directory: string): Promise<FsEntrySummary | null> {
  const paths = projectPaths(directory);

  let project;
  try {
    project = parseProjectDocument(await readFile(paths.project, "utf8"));
  } catch {
    return null;
  }

  let transcriptWords = 0;
  try {
    const transcript = parseTranscript(await readFile(paths.transcript, "utf8"));
    transcriptWords = transcript.words.length - transcript.removedWordIds.length;
  } catch {
    // No transcript yet.
  }

  return {
    name: project.name,
    transcriptWords,
    hasMedia: project.media !== undefined,
    createdAt: project.createdAt,
  };
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

      // Hidden folders are configuration, not work you came here to open.
      const visible = directories.filter((name) => !name.startsWith("."));

      const entries = await Promise.all(
        visible.map(async (name): Promise<FsEntry> => {
          const childPath = path.join(directory, name);
          const summary = await summariseProject(childPath);
          return summary === null
            ? { name, path: childPath, isProject: false }
            : { name, path: childPath, isProject: true, summary };
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
