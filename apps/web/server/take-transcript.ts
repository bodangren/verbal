import type { SpokenWord, TranscriptionProvider } from "@verbal/ai";
import { writeFileAtomic, type FileSystem } from "@verbal/core";
import path from "node:path";
import { takeMediaPath, takeTranscriptPath } from "./take-store";

export type TakeTranscript = {
  words: SpokenWord[];
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function isWord(value: unknown): value is SpokenWord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.text === "string" &&
    typeof record.start === "number" &&
    Number.isFinite(record.start) &&
    typeof record.end === "number" &&
    Number.isFinite(record.end)
  );
}

/** Parses a take transcript; malformed words are dropped. */
export function parseTakeTranscript(raw: string): TakeTranscript | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const words = (value as { words?: unknown }).words;
    if (!Array.isArray(words)) {
      return null;
    }
    return { words: words.filter(isWord) };
  } catch {
    return null;
  }
}

export async function saveTakeTranscript(
  fs: FileSystem,
  root: string,
  takeId: string,
  words: readonly SpokenWord[],
): Promise<void> {
  const target = takeTranscriptPath(root, takeId);
  await fs.mkdir(path.dirname(target));
  await writeFileAtomic(fs, target, `${JSON.stringify({ words }, null, 2)}\n`);
}

export async function readTakeTranscript(
  fs: FileSystem,
  root: string,
  takeId: string,
): Promise<TakeTranscript | null> {
  try {
    return parseTakeTranscript(await fs.readFile(takeTranscriptPath(root, takeId)));
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export type TakeTranscriptDeps = {
  fs: FileSystem;
  provider: TranscriptionProvider;
};

/**
 * Transcribes one take and stores its word timestamps beside the media.
 *
 * The provider is injected so local and cloud ASR use the same path and the
 * tests never touch a network.
 */
export async function transcribeTake(
  deps: TakeTranscriptDeps,
  input: { root: string; takeId: string },
): Promise<TakeTranscript> {
  const result = await deps.provider.transcribe({
    filePath: takeMediaPath(input.root, input.takeId),
  });
  await saveTakeTranscript(deps.fs, input.root, input.takeId, result.words);
  return { words: result.words };
}

