import type { FileSystem } from "@verbal/core";

export type FakeFileSystem = FileSystem & {
  files: Map<string, string>;
  directories: Set<string>;
};

/** In-memory file system for service tests. */
export function createFakeFileSystem(): FakeFileSystem {
  const files = new Map<string, string>();
  const directories = new Set<string>();

  return {
    files,
    directories,

    async mkdir(path: string): Promise<void> {
      directories.add(path);
    },

    async readFile(path: string): Promise<string> {
      const contents = files.get(path);
      if (contents === undefined) {
        const error = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return contents;
    },

    async writeFileDurable(path: string, data: string): Promise<void> {
      files.set(path, data);
    },

    async rename(from: string, to: string): Promise<void> {
      const contents = files.get(from);
      if (contents === undefined) {
        throw new Error(`ENOENT: ${from}`);
      }
      files.delete(from);
      files.set(to, contents);
    },

    async unlink(path: string): Promise<void> {
      files.delete(path);
    },
  };
}
