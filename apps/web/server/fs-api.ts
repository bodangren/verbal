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
  /** End of the last transcript word, in seconds; 0 without a transcript. */
  durationSeconds: number;
};

export type FsEntryKind = "directory" | "file";

export type FsEntry = {
  name: string;
  path: string;
  isProject: boolean;
  kind: FsEntryKind;
  /** True for a file the media importer can take. */
  isMedia?: boolean;
  summary?: FsEntrySummary;
};

export type FsListOptions = {
  /** List media files beside folders, for the import picker. */
  includeFiles?: boolean;
};

/** Extensions the importer accepts; the picker lists only these files. */
export const MEDIA_EXTENSIONS = new Set([
  ".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi",
  ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus",
]);

export function isMediaFile(name: string): boolean {
  return MEDIA_EXTENSIONS.has(path.extname(name).toLowerCase());
}

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
  let durationSeconds = 0;
  try {
    const transcript = parseTranscript(await readFile(paths.transcript, "utf8"));
    transcriptWords = transcript.words.length - transcript.removedWordIds.length;
    durationSeconds = transcript.words[transcript.words.length - 1]?.end ?? 0;
  } catch {
    // No transcript yet.
  }

  return {
    name: project.name,
    transcriptWords,
    hasMedia: project.media !== undefined,
    createdAt: project.createdAt,
    durationSeconds,
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
  overrides: {
    home?: () => string;
    list?: (directory: string, options?: FsListOptions) => Promise<FsEntry[]>;
  } = {},
) {
  const home = overrides.home ?? (() => os.homedir());

  const list =
    overrides.list ??
    (async (directory: string, options?: FsListOptions): Promise<FsEntry[]> => {
      const dirents = await readdir(directory, { withFileTypes: true });

      // Hidden entries are configuration, not work you came here to open.
      const directories = dirents
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => !name.startsWith("."));

      const files = options?.includeFiles
        ? dirents
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => !name.startsWith(".") && isMediaFile(name))
        : [];

      const directoryEntries = await Promise.all(
        directories.map(async (name): Promise<FsEntry> => {
          const childPath = path.join(directory, name);
          const summary = await summariseProject(childPath);
          return summary === null
            ? { name, path: childPath, isProject: false, kind: "directory" }
            : { name, path: childPath, isProject: true, kind: "directory", summary };
        }),
      );

      const fileEntries: FsEntry[] = files.map((name) => ({
        name,
        path: path.join(directory, name),
        isProject: false,
        kind: "file",
        isMedia: true,
      }));

      // Projects first, then folders, then media files: the order of intent.
      return [...directoryEntries, ...fileEntries].sort((left, right) => {
        const rank = (entry: FsEntry) =>
          entry.isProject ? 0 : entry.kind === "directory" ? 1 : 2;
        if (rank(left) !== rank(right)) {
          return rank(left) - rank(right);
        }
        return left.name.localeCompare(right.name);
      });
    });

  return {
    async listing(
      requested: string | undefined,
      options: FsListOptions = {},
    ): Promise<FsListing> {
      const target = requested === undefined || requested.trim() === "" ? home() : requested;

      if (!path.isAbsolute(target)) {
        throw new ProjectError("invalid-path", "path must be an absolute folder");
      }

      let entries: FsEntry[];
      try {
        entries = await list(target, options);
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
