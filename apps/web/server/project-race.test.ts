import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeMediaRevision,
  nodeFileSystem,
  openProject,
  saveProject,
  type FileSystem,
  type JobKind,
  type JobRecord,
  type JobRegistry,
} from "@verbal/core";
import { createMediaApi } from "./media-api";
import { createTakeApi } from "./take-api";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

function delayingFs(delays: readonly number[]): FileSystem {
  let index = 0;
  const wait = async () => {
    const ms = delays[index % delays.length] ?? 0;
    index += 1;
    await new Promise((resolve) => setTimeout(resolve, ms));
  };
  return {
    async mkdir(p) {
      await wait();
      return nodeFileSystem.mkdir(p);
    },
    async readFile(p) {
      await wait();
      return nodeFileSystem.readFile(p);
    },
    async writeFileDurable(p, d) {
      await wait();
      return nodeFileSystem.writeFileDurable(p, d);
    },
    async rename(f, t) {
      await wait();
      return nodeFileSystem.rename(f, t);
    },
    async unlink(p) {
      await wait();
      return nodeFileSystem.unlink(p);
    },
  };
}

describe("project media replacement races", () => {
  it("an import and a take upload racing end with the newer reference and a matching revision", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verbal-race-"));
    roots.push(root);
    await saveProject(nodeFileSystem, root, {
      schemaVersion: 1,
      id: "p1",
      name: "Race",
      createdAt: "2026-11-28T00:00:00.000Z",
    });

    const fs = delayingFs([4, 1, 8, 2, 6, 1]);

    // The import holds the lock on its stat, so the take upload activation is
    // queued behind it and becomes the newer reference.
    let importStarted = false;
    let releaseImport!: () => void;
    const importGate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });

    const mediaApi = createMediaApi({
      fs,
      importMedia: async () => ({
        mode: "copy",
        assetPath: "assets/imported.mp4",
        absolutePath: path.join(root, "assets", "imported.mp4"),
      }),
      stat: async () => {
        importStarted = true;
        await importGate;
        return { size: 111, mtimeMs: 222 };
      },
    });

    const registry = {
      create: async (kind: JobKind): Promise<JobRecord> => ({
        id: "job-1",
        kind,
        status: "queued",
        createdAt: "2026-11-28T00:00:00.000Z",
        updatedAt: "2026-11-28T00:00:00.000Z",
        progress: 0,
        message: null,
        result: null,
        error: null,
      }),
    } as unknown as JobRegistry;

    const takeApi = createTakeApi({
      registry,
      fs,
      now: () => new Date("2026-11-28T00:00:00.000Z"),
      runNormalize: async (input) => {
        await input.onOutput?.(input.outputPath);
      },
      stat: async () => ({ size: 333, mtimeMs: 444 }),
    });

    const importing = mediaApi.import({
      projectRoot: root,
      sourcePath: "/media/source.mp4",
      mode: "copy",
    });
    await vi.waitFor(() => expect(importStarted).toBe(true));

    const uploading = takeApi.upload({
      root,
      takeId: "take-1",
      durationSeconds: 2,
      dataBase64: Buffer.from("recorded bytes").toString("base64"),
    });
    await expect(uploading).resolves.toMatchObject({ status: 202 });

    releaseImport();
    await importing;

    // Wait for the queued take upload activation to settle.
    await vi.waitFor(async () => {
      const project = await openProject(nodeFileSystem, root);
      expect(project.media?.assetPath).toBe("takes/take-1.mp4");
    });

    const project = await openProject(nodeFileSystem, root);
    const expected = await computeMediaRevision({
      mediaPath: path.join(root, "takes", "take-1.mp4"),
      stat: async () => ({ size: 333, mtimeMs: 444 }),
    });
    expect(project.media?.mediaRevision).toBe(expected);
  });
});
