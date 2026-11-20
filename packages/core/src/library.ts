import path from "node:path";
import type { FileSystem } from "./atomic";
import { openProject, projectPaths } from "./project";
import { parseTranscript } from "./transcript";

/** One project as the library lists it. */
export type ProjectSummary = {
  root: string;
  name: string;
  hasMedia: boolean;
  /** Words that survive the removals. */
  transcriptWords: number;
  removedWords: number;
  createdAt: string;
};

export type LibraryDeps = {
  fs: FileSystem;
  /** Immediate subdirectory names of a folder. */
  listDirectory: (directory: string) => Promise<string[]>;
};

/**
 * Summarises the projects one level below a folder.
 *
 * A candidate that is not a project, or whose document cannot be read, is
 * skipped rather than failing the whole scan: a library listing that breaks
 * because one folder is damaged is worse than one that omits it. A missing or
 * invalid transcript costs the word counts, not the row, since the project
 * itself is still openable and transcribable.
 */
export async function scanLibrary(
  folder: string,
  deps: LibraryDeps,
): Promise<ProjectSummary[]> {
  const entries = await deps.listDirectory(folder);
  const summaries: ProjectSummary[] = [];

  for (const entry of entries) {
    const root = path.join(folder, entry);

    let project;
    try {
      project = await openProject(deps.fs, root);
    } catch {
      continue;
    }

    let transcriptWords = 0;
    let removedWords = 0;

    try {
      const transcript = parseTranscript(await deps.fs.readFile(projectPaths(root).transcript));
      removedWords = transcript.removedWordIds.length;
      transcriptWords = transcript.words.length - removedWords;
    } catch {
      // No transcript yet, or an unreadable one: the row still belongs here.
    }

    summaries.push({
      root,
      name: project.name,
      hasMedia: project.media !== undefined,
      transcriptWords,
      removedWords,
      createdAt: project.createdAt,
    });
  }

  return summaries.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return left.name.localeCompare(right.name);
  });
}
