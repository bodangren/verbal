import {
  ProjectError,
  nodeFileSystem,
  openProject,
  parseTranscript,
  projectPaths,
  resolveMediaPath,
  writeFileAtomic,
  type FileSystem,
} from "@verbal/core";
import { freezeMaster, type FrozenMaster } from "@verbal/cleanup/freeze";
import { probeMedia, runCommand } from "@verbal/media";

/** The cut and anchor index for a project's current transcript. */
export type FreezeResult = {
  master: FrozenMaster;
};

export type FreezeApiDeps = {
  fs: FileSystem;
  /** Duration of the source media, in seconds. */
  probeSeconds: (filePath: string) => Promise<number>;
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
 * Freezes a project's edited transcript into a cut list and anchor index.
 *
 * The stored transcript is the source of truth: accepted proposals are applied
 * to the document before freezing, so there is no second edit state to drift.
 * The result is persisted in `edit.json` so a later render can tell whether its
 * anchors still match the cut.
 */
export function createFreezeApi(overrides: Partial<FreezeApiDeps> = {}) {
  const deps: FreezeApiDeps = {
    fs: nodeFileSystem,
    probeSeconds: async (filePath) => (await probeMedia(runCommand, filePath)).durationSeconds ?? 0,
    ...overrides,
  };

  return {
    async freeze(root: string): Promise<FreezeResult> {
      const project = await openProject(deps.fs, root);
      const mediaPath = resolveMediaPath(project, root);

      if (mediaPath === null) {
        throw new ProjectError("not-found", `the project at ${root} has no media`);
      }

      let raw: string;
      try {
        raw = await deps.fs.readFile(projectPaths(root).transcript);
      } catch (error) {
        if (isNotFound(error)) {
          throw new ProjectError("not-found", `no transcript at ${root}`);
        }
        throw error;
      }

      const transcript = parseTranscript(raw);
      const sourceDurationSeconds = await deps.probeSeconds(mediaPath);

      const master = freezeMaster({ transcript, accepted: [], sourceDurationSeconds });

      const document = { schemaVersion: 1, frozen: master };
      await writeFileAtomic(
        deps.fs,
        projectPaths(root).edit,
        `${JSON.stringify(document, null, 2)}\n`,
      );

      return { master };
    },
  };
}
