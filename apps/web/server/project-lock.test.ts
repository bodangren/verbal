import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  computeMediaRevision,
  createProject,
  openProject,
  replaceProjectMedia,
  saveProject,
  type FileSystem,
} from "@verbal/core";
import { createFakeFileSystem } from "./test-support";
import { pendingProjectLocks, withProjectLock } from "./project-lock";

const ROOT = "/projects/demo";

/** Wraps a file system so every operation pauses for the next delay. */
function delayingFs(inner: FileSystem, delays: readonly number[]): FileSystem {
  let index = 0;
  const wait = async () => {
    const ms = delays[index % delays.length] ?? 0;
    index += 1;
    await new Promise((resolve) => setTimeout(resolve, ms));
  };
  return {
    async mkdir(p) {
      await wait();
      return inner.mkdir(p);
    },
    async readFile(p) {
      await wait();
      return inner.readFile(p);
    },
    async writeFileDurable(p, d) {
      await wait();
      return inner.writeFileDurable(p, d);
    },
    async rename(f, t) {
      await wait();
      return inner.rename(f, t);
    },
    async unlink(p) {
      await wait();
      return inner.unlink(p);
    },
  };
}

/** One read-modify-write of the project media reference, as the callers do. */
function replaceSection(fs: FileSystem, n: number): Promise<void> {
  return withProjectLock(ROOT, async () => {
    const project = await openProject(fs, ROOT);
    const mediaPath = `/media/a${n}.mp4`;
    const updated = await replaceProjectMedia(
      project,
      { assetPath: `assets/a${n}.mp4` },
      { mediaPath, stat: async () => ({ size: n + 1, mtimeMs: 1000 + n }) },
    );
    await saveProject(fs, ROOT, updated);
  });
}

describe("withProjectLock", () => {
  it("serializes ten concurrent media replacements so the last write wins", async () => {
    const inner = createFakeFileSystem();
    await createProject(inner, ROOT, { name: "Demo", id: "p1" });
    // Without a lock these delays land reads and writes out of order, so a
    // stale snapshot would clobber a newer one and the final asset would not
    // be the last queued operation.
    const fs = delayingFs(inner, [9, 1, 7, 2, 6, 3, 5, 4, 8, 1]);

    await Promise.all(Array.from({ length: 10 }, (_, n) => replaceSection(fs, n)));

    const project = await openProject(inner, ROOT);
    expect(project.media?.assetPath).toBe("assets/a9.mp4");
    const expected = await computeMediaRevision({
      mediaPath: "/media/a9.mp4",
      stat: async () => ({ size: 10, mtimeMs: 1009 }),
    });
    expect(project.media?.mediaRevision).toBe(expected);
  });

  it("a throwing section does not block the next", async () => {
    const fs = createFakeFileSystem();
    await createProject(fs, ROOT, { name: "Demo", id: "p1" });
    const order: number[] = [];

    const first = withProjectLock(ROOT, async () => {
      order.push(1);
      throw new Error("boom");
    });
    const second = withProjectLock(ROOT, async () => {
      order.push(2);
      const project = await openProject(fs, ROOT);
      await saveProject(fs, ROOT, project);
    });

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBeUndefined();
    expect(order).toEqual([1, 2]);
  });

  it("removes the lock entry after the queue drains", async () => {
    const fs = createFakeFileSystem();
    await createProject(fs, ROOT, { name: "Demo", id: "p1" });

    expect(pendingProjectLocks()).toBe(0);
    await withProjectLock(ROOT, async () => {
      await saveProject(fs, ROOT, await openProject(fs, ROOT));
    });
    await vi.waitFor(() => expect(pendingProjectLocks()).toBe(0));
  });

  it(
    "rejects a nested lock on the same root instead of deadlocking",
    { timeout: 2000 },
    async () => {
      await expect(
        withProjectLock(ROOT, () => withProjectLock(ROOT, async () => undefined)),
      ).rejects.toThrow(`withProjectLock is not re-entrant: ${path.resolve(ROOT)}`);
    },
  );

  it("allows nesting locks for different roots", async () => {
    const order: string[] = [];
    await withProjectLock("/a", async () => {
      order.push("a");
      await withProjectLock("/b", async () => {
        order.push("b");
      });
    });
    expect(order).toEqual(["a", "b"]);
  });
});
