import { writeFileAtomic, type FileSystem } from "./atomic";
import { serializeTranscript, type TranscriptDocument } from "./transcript";

/**
 * Writes a transcript document atomically.
 *
 * Kept out of `transcript.ts` so the transcript model stays free of Node
 * built-ins: the client imports that model, and a barrel that pulls a single
 * `node:fs` dependency into the browser bundle breaks hydration in dev, where
 * nothing is tree-shaken.
 */
export async function saveTranscript(
  fs: FileSystem,
  filePath: string,
  transcript: TranscriptDocument,
): Promise<void> {
  await writeFileAtomic(fs, filePath, serializeTranscript(transcript));
}
