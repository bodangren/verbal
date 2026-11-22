import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFsApi } from "./fs-api";

describe("fs listing", () => {
  let root = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "verbal-fs-"));
    await mkdir(path.join(root, "zeta"), { recursive: true });
    await mkdir(path.join(root, "alpha"), { recursive: true });
    await mkdir(path.join(root, "take-one"), { recursive: true });
    await writeFile(
      path.join(root, "take-one", "project.json"),
      JSON.stringify({ schemaVersion: 1, id: "p", name: "Take one", createdAt: "2026-11-21T00:00:00.000Z" }),
    );
    await writeFile(path.join(root, "clip.mp4"), "x");
    await writeFile(path.join(root, "notes.txt"), "x");
    await writeFile(path.join(root, ".hidden.mp4"), "x");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("lists subdirectories as paths the UI can enter", async () => {
    const listing = await createFsApi().listing(root);

    expect(listing.path).toBe(path.resolve(root));
    expect(listing.entries.map((entry) => entry.name).sort()).toEqual(["alpha", "take-one", "zeta"]);
    expect(listing.entries.every((entry) => entry.path.startsWith(root))).toBe(true);
  });

  it("flags directories that hold a project and sorts them first", async () => {
    const listing = await createFsApi().listing(root);

    expect(listing.entries[0]).toMatchObject({ name: "take-one", isProject: true });
    expect(listing.entries.slice(1).every((entry) => entry.isProject === false)).toBe(true);
  });

  it("lists media files only when asked, with folders first", async () => {
    const api = createFsApi();

    const foldersOnly = await api.listing(root);
    expect(foldersOnly.entries.some((entry) => entry.kind === "file")).toBe(false);

    const withFiles = await api.listing(root, { includeFiles: true });
    const names = withFiles.entries.map((entry) => entry.name);
    expect(names).toContain("clip.mp4");
    expect(names).not.toContain("notes.txt");
    expect(names).not.toContain(".hidden.mp4");

    const firstFile = withFiles.entries.findIndex((entry) => entry.kind === "file");
    const lastFolder = withFiles.entries.reduce(
      (latest, entry, index) => (entry.kind === "directory" ? index : latest),
      -1,
    );
    expect(firstFile).toBeGreaterThan(lastFolder);
    expect(withFiles.entries[firstFile]).toMatchObject({
      isMedia: true,
      isProject: false,
      kind: "file",
    });
  });

  it("offers the parent folder, but not above the filesystem root", async () => {
    expect((await createFsApi().listing(root)).parent).toBe(path.dirname(path.resolve(root)));
    expect((await createFsApi().listing(path.parse(root).root)).parent).toBeNull();
  });

  it("defaults to the home folder", async () => {
    const api = createFsApi({ home: () => root, list: async () => [] });

    expect((await api.listing(undefined)).path).toBe(path.resolve(root));
  });

  it("rejects a relative path and reports a missing folder", async () => {
    const api = createFsApi();

    await expect(api.listing("relative/path")).rejects.toThrow(/absolute/i);
    await expect(api.listing(path.join(root, "nope"))).rejects.toThrow(/no folder/i);
  });
});
