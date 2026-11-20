import { randomUUID } from "node:crypto";
import { promises as nodeFs } from "node:fs";

/**
 * The file operations the storage layer needs.
 *
 * Injecting them keeps durability and failure paths testable without touching
 * a real disk.
 */
export interface FileSystem {
  mkdir(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  /** Writes the file and flushes it to disk before resolving. */
  writeFileDurable(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

/** Production file system backed by `node:fs/promises`. */
export const nodeFileSystem: FileSystem = {
  async mkdir(path: string): Promise<void> {
    await nodeFs.mkdir(path, { recursive: true });
  },

  async readFile(path: string): Promise<string> {
    return nodeFs.readFile(path, "utf8");
  },

  async writeFileDurable(path: string, data: string): Promise<void> {
    const handle = await nodeFs.open(path, "w");
    try {
      await handle.writeFile(data, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  },

  async rename(from: string, to: string): Promise<void> {
    await nodeFs.rename(from, to);
  },

  async unlink(path: string): Promise<void> {
    await nodeFs.unlink(path);
  },
};

/**
 * Writes `data` to `path` atomically.
 *
 * The data lands in a sibling temporary file that is flushed to disk, then
 * renamed over the target. A reader therefore sees either the previous
 * contents or the new contents, never a partial write.
 */
export async function writeFileAtomic(
  fs: FileSystem,
  path: string,
  data: string,
): Promise<void> {
  const temporary = `${path}.tmp-${randomUUID()}`;

  try {
    await fs.writeFileDurable(temporary, data);
    await fs.rename(temporary, path);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
}
