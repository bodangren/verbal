import path from "node:path";
import { nodeFileSystem, writeFileAtomic, type FileSystem } from "@verbal/core";

export type Take = {
  id: string;
  fileName: string;
  createdAt: string;
  durationSeconds: number;
};

export type TakesDocument = {
  takes: Take[];
};

export const TAKES_DIR = "takes";
export const TAKES_FILE = "takes.json";

export function takeFilePath(root: string, take: Pick<Take, "fileName">): string {
  return path.join(root, TAKES_DIR, take.fileName);
}

/** The normalized MP4 for a take id. */
export function takeMediaPath(root: string, takeId: string): string {
  return path.join(root, TAKES_DIR, `${takeId}.mp4`);
}

/** The word-timestamped transcript for a take id. */
export function takeTranscriptPath(root: string, takeId: string): string {
  return path.join(root, TAKES_DIR, `${takeId}.transcript.json`);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function isTake(value: unknown): value is Take {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.trim() !== "" &&
    typeof record.fileName === "string" &&
    record.fileName.trim() !== "" &&
    typeof record.createdAt === "string" &&
    typeof record.durationSeconds === "number" &&
    Number.isFinite(record.durationSeconds)
  );
}

/** Parses a manifest; malformed entries are dropped, not trusted. */
export function parseTakes(raw: string): TakesDocument {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) {
      return { takes: [] };
    }
    const entries = (value as { takes?: unknown }).takes;
    if (!Array.isArray(entries)) {
      return { takes: [] };
    }
    return { takes: entries.filter(isTake) };
  } catch {
    return { takes: [] };
  }
}

export async function readTakes(
  fs: FileSystem = nodeFileSystem,
  root: string,
): Promise<TakesDocument> {
  try {
    return parseTakes(await fs.readFile(path.join(root, TAKES_FILE)));
  } catch (error) {
    if (isNotFound(error)) {
      return { takes: [] };
    }
    throw error;
  }
}

export async function saveTakes(
  fs: FileSystem,
  root: string,
  document: TakesDocument,
): Promise<void> {
  await writeFileAtomic(
    fs,
    path.join(root, TAKES_FILE),
    `${JSON.stringify(document, null, 2)}\n`,
  );
}

export async function addTake(
  fs: FileSystem,
  root: string,
  take: Take,
): Promise<TakesDocument> {
  const document = await readTakes(fs, root);
  const next = {
    takes: [...document.takes.filter((entry) => entry.id !== take.id), take],
  };
  await saveTakes(fs, root, next);
  return next;
}

export async function removeTake(
  fs: FileSystem,
  root: string,
  id: string,
): Promise<TakesDocument> {
  const document = await readTakes(fs, root);
  const next = { takes: document.takes.filter((entry) => entry.id !== id) };
  await saveTakes(fs, root, next);
  return next;
}
