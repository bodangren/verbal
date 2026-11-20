import { describe, expect, it } from "vitest";
import type { FileSystem } from "@verbal/core";
import { createFileSlideCache, createMemorySlideCache } from "./cache";
import type { SlideManifest } from "./types";

const MANIFEST: SlideManifest = {
  frames: 30,
  fps: 30,
  width: 640,
  height: 360,
  hasAlpha: true,
  pattern: "frame-%04d.png",
};

class FakeFileSystem implements FileSystem {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();

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

describe("createMemorySlideCache", () => {
  it("reports a miss, then a hit after writing", async () => {
    const cache = createMemorySlideCache("/cache");

    expect(await cache.has("abc")).toBe(false);
    expect(await cache.readManifest("abc")).toBeNull();

    await cache.writeManifest("abc", MANIFEST);

    expect(await cache.has("abc")).toBe(true);
    expect(await cache.readManifest("abc")).toEqual(MANIFEST);
  });

  it("derives its directory from the root and hash", () => {
    expect(createMemorySlideCache("/cache").directory("abc")).toBe("/cache/abc");
  });
});

describe("createFileSlideCache", () => {
  it("writes a manifest under the hash directory", async () => {
    const fs = new FakeFileSystem();
    const cache = createFileSlideCache(fs, "/cache");

    await cache.writeManifest("abc", MANIFEST);

    expect(fs.directories).toContain("/cache/abc");
    const raw = fs.files.get("/cache/abc/manifest.json");
    expect(raw).toBeDefined();
    expect(JSON.parse(raw ?? "{}")).toEqual(MANIFEST);
    expect(await cache.readManifest("abc")).toEqual(MANIFEST);
    expect(cache.directory("abc")).toBe("/cache/abc");
  });

  it("reports a miss for a missing manifest", async () => {
    const cache = createFileSlideCache(new FakeFileSystem(), "/cache");

    expect(await cache.has("missing")).toBe(false);
    expect(await cache.readManifest("missing")).toBeNull();
  });

  it("rejects a corrupt manifest", async () => {
    const fs = new FakeFileSystem();
    fs.files.set("/cache/abc/manifest.json", "{not json");
    const cache = createFileSlideCache(fs, "/cache");

    expect(await cache.readManifest("abc")).toBeNull();
  });
});
