import { describe, expect, it } from "vitest";
import { writeFileAtomic, type FileSystem } from "./atomic";

/** In-memory file system that can be told to fail during the temporary write. */
class FakeFileSystem implements FileSystem {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  failWriteWhen: ((path: string) => boolean) | null = null;

  async mkdir(path: string): Promise<void> {
    this.directories.add(path);
  }

  async readFile(path: string): Promise<string> {
    const contents = this.files.get(path);
    if (contents === undefined) {
      const error = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    return contents;
  }

  async writeFileDurable(path: string, data: string): Promise<void> {
    if (this.failWriteWhen?.(path) === true) {
      throw new Error("simulated disk full");
    }
    this.files.set(path, data);
  }

  async rename(from: string, to: string): Promise<void> {
    const contents = this.files.get(from);
    if (contents === undefined) {
      throw new Error(`ENOENT: ${from}`);
    }
    this.files.delete(from);
    this.files.set(to, contents);
  }

  async unlink(path: string): Promise<void> {
    this.files.delete(path);
  }
}

describe("writeFileAtomic", () => {
  it("writes the file through a temporary and a rename", async () => {
    const fs = new FakeFileSystem();

    await writeFileAtomic(fs, "project.json", '{"a":1}\n');

    expect(fs.files.get("project.json")).toBe('{"a":1}\n');
  });

  it("keeps the previous contents when the temporary write fails", async () => {
    const fs = new FakeFileSystem();
    fs.files.set("project.json", "previous");
    fs.failWriteWhen = (path) => path.includes(".tmp-");

    await expect(writeFileAtomic(fs, "project.json", "next")).rejects.toThrow(/disk full/);

    expect(fs.files.get("project.json")).toBe("previous");
  });

  it("removes the temporary file when the write fails", async () => {
    const fs = new FakeFileSystem();
    fs.failWriteWhen = (path) => path.includes(".tmp-");

    await expect(writeFileAtomic(fs, "project.json", "next")).rejects.toThrow();

    expect([...fs.files.keys()]).toEqual([]);
  });

  it("leaves no temporary file behind on success", async () => {
    const fs = new FakeFileSystem();

    await writeFileAtomic(fs, "project.json", "done");

    expect([...fs.files.keys()]).toEqual(["project.json"]);
  });
});
