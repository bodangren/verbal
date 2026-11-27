import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nodeFileSystem, type FileSystem } from "@verbal/core";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeFileSystem } from "./test-support";
import {
  addTake,
  parseTakes,
  readTakes,
  removeTake,
  TAKES_FILE,
  takeFilePath,
} from "./take-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-takes-"));
  roots.push(root);
  return root;
}

const take = {
  id: "take-1",
  fileName: "take-1.mp4",
  createdAt: "2026-11-23T10:00:00.000Z",
  durationSeconds: 12,
};

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

describe("take store", () => {
  it("reads an empty manifest when none exists", async () => {
    expect(await readTakes(nodeFileSystem, await tempRoot())).toEqual({ takes: [] });
  });

  it("adds and reads a take", async () => {
    const root = await tempRoot();

    await addTake(nodeFileSystem, root, take);

    expect(await readTakes(nodeFileSystem, root)).toEqual({ takes: [take] });
    expect(JSON.parse(await readFile(path.join(root, TAKES_FILE), "utf8"))).toEqual({
      takes: [take],
    });
  });

  it("replaces a take with the same id", async () => {
    const root = await tempRoot();

    await addTake(nodeFileSystem, root, take);
    await addTake(nodeFileSystem, root, { ...take, durationSeconds: 20 });

    expect((await readTakes(nodeFileSystem, root)).takes).toHaveLength(1);
    expect((await readTakes(nodeFileSystem, root)).takes[0]?.durationSeconds).toBe(20);
  });

  it("removes a take", async () => {
    const root = await tempRoot();
    await addTake(nodeFileSystem, root, take);

    await removeTake(nodeFileSystem, root, take.id);

    expect(await readTakes(nodeFileSystem, root)).toEqual({ takes: [] });
  });

  it("keeps both takes when two addTake calls race on an empty manifest", async () => {
    const inner = createFakeFileSystem();
    // Slow reads and fast writes make the two sections each read an empty
    // manifest before either writes, so an unlocked read-modify-write loses one.
    const fs = delayingFs(inner, [40, 40, 0, 0, 0, 0]);

    await Promise.all([
      addTake(fs, "/projects/demo", { ...take, id: "take-a", fileName: "take-a.mp4" }),
      addTake(fs, "/projects/demo", {
        ...take,
        id: "take-b",
        fileName: "take-b.mp4",
        durationSeconds: 20,
      }),
    ]);

    const document = await readTakes(inner, "/projects/demo");
    expect(document.takes.map((entry) => entry.id).sort()).toEqual(["take-a", "take-b"]);
  });

  it("drops malformed manifest entries", () => {
    expect(
      parseTakes(
        JSON.stringify({
          takes: [take, { id: "bad" }, { ...take, id: "take-2", fileName: "" }],
        }),
      ),
    ).toEqual({ takes: [take] });
    expect(parseTakes("not json")).toEqual({ takes: [] });
    expect(parseTakes(JSON.stringify({ nope: [] }))).toEqual({ takes: [] });
  });

  it("resolves a take file inside takes/", () => {
    expect(takeFilePath("/p", take)).toBe("/p/takes/take-1.mp4");
  });
});
