import {
  ProjectError,
  nodeFileSystem,
  parseTranscript,
  projectPaths,
  type FileSystem,
  type TranscriptDocument,
} from "@verbal/core";
import {
  detectProposals,
  type AudioFix,
  type CleanupProposal,
} from "@verbal/cleanup";

/** What the review surface needs: what to cut, and what to fix in the audio. */
export type CleanupResult = {
  proposals: CleanupProposal[];
  audioFixes: AudioFix[];
};

export type CleanupApiDeps = {
  fs: FileSystem;
  detect: (transcript: TranscriptDocument) => CleanupProposal[];
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
 * Proposals for the stored transcript of a project.
 *
 * Detection runs on request against the transcript on disk, so proposals track
 * the document instead of drifting from it as edits are saved.
 */
export function createCleanupApi(overrides: Partial<CleanupApiDeps> = {}) {
  const deps: CleanupApiDeps = {
    fs: nodeFileSystem,
    detect: (transcript) => detectProposals(transcript),
    ...overrides,
  };

  return {
    async proposals(root: string): Promise<CleanupResult> {
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

      return {
        proposals: deps.detect(transcript),
        // Hum/rumble/level analysis needs the audio spectrum, which this build
        // does not analyse yet. The review renders the list when it is non-empty.
        audioFixes: [],
      };
    },
  };
}
