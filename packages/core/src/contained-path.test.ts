import { mkdir, mkdtemp, realpath as nodeRealpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectError } from "./errors";
import { assertProjectRelativePath, resolveContainedFile } from "./contained-path";

const ROOT = path.join(path.sep, "projects", "Demo Ünï ✓");
const identity = async (value: string) => value;

describe("assertProjectRelativePath", () => {
  it("accepts a relative path with Unicode and spaces", () => {
    expect(() => assertProjectRelativePath("assets/music one ✓.mp3")).not.toThrow();
  });

  it("rejects a null byte", () => {
    expect(() => assertProjectRelativePath("assets/music\0.mp3")).toThrow(/null byte/);
  });

  it("rejects parent traversal", () => {
    expect(() => assertProjectRelativePath("../../etc/passwd")).toThrow(ProjectError);
  });

  it("rejects an absolute path", () => {
    expect(() => assertProjectRelativePath("/etc/passwd")).toThrow(/absolute/);
  });
});

describe("resolveContainedFile", () => {
  it("resolves a Unicode, spaced path inside the project", async () => {
    await expect(
      resolveContainedFile(ROOT, "assets/clip one ✓.mp4", identity),
    ).resolves.toBe(path.join(ROOT, "assets", "clip one ✓.mp4"));
  });

  it("rejects a parent-directory escape", async () => {
    await expect(resolveContainedFile(ROOT, "../secret.mp3", identity)).rejects.toThrow(
      /outside the project/,
    );
  });

  it("rejects a null byte", async () => {
    await expect(resolveContainedFile(ROOT, "assets/a\0b.mp3", identity)).rejects.toThrow(
      /null byte/,
    );
  });

  it("rejects a real path that leaves the project", async () => {
    const escaping = async (value: string) =>
      value === ROOT ? ROOT : path.join(path.sep, "etc", "passwd");

    await expect(resolveContainedFile(ROOT, "assets/link.mp3", escaping)).rejects.toThrow(
      /outside the project/,
    );
  });

  it("reports a missing file as not found", async () => {
    const missing = async (value: string): Promise<string> => {
      if (value === ROOT) {
        return ROOT;
      }
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    };

    await expect(resolveContainedFile(ROOT, "assets/x.mp3", missing)).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("resolveContainedFile on a real disk", () => {
  let base: string;
  let root: string;

  beforeEach(async () => {
    base = await mkdtemp(path.join(tmpdir(), "contained-"));
    root = path.join(base, "project");
    await mkdir(path.join(root, "assets"), { recursive: true });
    await writeFile(path.join(root, "assets", "take one.mp4"), "video");
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("accepts an ordinary file inside the project", async () => {
    await expect(resolveContainedFile(root, "assets/take one.mp4")).resolves.toBe(
      await nodeRealpath(path.join(root, "assets", "take one.mp4")),
    );
  });

  it("rejects a symlink that points out of the project", async () => {
    const outside = path.join(base, "outside.mp3");
    await writeFile(outside, "secret");
    await symlink(outside, path.join(root, "assets", "link.mp3"));

    await expect(resolveContainedFile(root, "assets/link.mp3")).rejects.toThrow(
      /outside the project/,
    );
  });
});
