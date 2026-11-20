import { describe, expect, it } from "vitest";
import { importMedia, MediaError, type ImportFileSystem } from "./import";

class FakeFileSystem implements ImportFileSystem {
  readonly directories: string[] = [];
  readonly copies: { from: string; to: string }[] = [];
  readonly existing = new Set<string>();

  async mkdir(path: string): Promise<void> {
    this.directories.push(path);
  }

  async copyFile(from: string, to: string): Promise<void> {
    this.copies.push({ from, to });
  }

  async exists(path: string): Promise<boolean> {
    return this.existing.has(path);
  }
}

describe("importMedia (copy mode)", () => {
  it("copies the source into the project assets directory", async () => {
    const fs = new FakeFileSystem();

    const result = await importMedia(fs, {
      mode: "copy",
      sourcePath: "/media/take.mp4",
      projectRoot: "/projects/demo",
    });

    expect(result).toEqual({
      mode: "copy",
      assetPath: "assets/take.mp4",
      absolutePath: "/projects/demo/assets/take.mp4",
    });
    expect(fs.directories).toContain("/projects/demo/assets");
    expect(fs.copies).toEqual([{ from: "/media/take.mp4", to: "/projects/demo/assets/take.mp4" }]);
  });

  it("honours an explicit file name", async () => {
    const fs = new FakeFileSystem();

    const result = await importMedia(fs, {
      mode: "copy",
      sourcePath: "/media/take.mp4",
      projectRoot: "/projects/demo",
      fileName: "intro.mp4",
    });

    expect(result).toMatchObject({ assetPath: "assets/intro.mp4" });
  });

  it("refuses to overwrite an existing asset", async () => {
    const fs = new FakeFileSystem();
    fs.existing.add("/projects/demo/assets/take.mp4");

    await expect(
      importMedia(fs, { mode: "copy", sourcePath: "/media/take.mp4", projectRoot: "/projects/demo" }),
    ).rejects.toMatchObject({ code: "already-exists" });
    expect(fs.copies).toEqual([]);
  });

  it("rejects a file name containing a path separator", async () => {
    const fs = new FakeFileSystem();

    await expect(
      importMedia(fs, {
        mode: "copy",
        sourcePath: "/media/take.mp4",
        projectRoot: "/projects/demo",
        fileName: "../escape.mp4",
      }),
    ).rejects.toBeInstanceOf(MediaError);
  });
});

describe("importMedia (reference mode)", () => {
  it("references the source in place without copying", async () => {
    const fs = new FakeFileSystem();

    const result = await importMedia(fs, {
      mode: "reference",
      sourcePath: "/media/take.mp4",
      projectRoot: "/projects/demo",
    });

    expect(result).toEqual({ mode: "reference", externalPath: "/media/take.mp4" });
    expect(fs.copies).toEqual([]);
  });

  it("requires an absolute source path", async () => {
    const fs = new FakeFileSystem();

    await expect(
      importMedia(fs, {
        mode: "reference",
        sourcePath: "media/take.mp4",
        projectRoot: "/projects/demo",
      }),
    ).rejects.toMatchObject({ code: "invalid-source" });
  });
});
