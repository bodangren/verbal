import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizeJobInput } from "./normalize-job";
import { createTakeApi, normalizeTakeId, normalizedTakePath, uploadedTakePath } from "./take-api";
import { addTake, readTakes, takeMediaPath } from "./take-store";

function jobRecord(id: string, kind: JobKind): JobRecord {
  return {
    id,
    kind,
    status: "queued",
    createdAt: "2026-11-23T10:00:00.000Z",
    updatedAt: "2026-11-23T10:00:00.000Z",
    progress: 0,
    message: null,
    result: null,
    error: null,
  };
}

/**
 * Drives `api.upload` with a fake normalize that writes a distinct byte string
 * to the temporary output and then runs `onOutput`, so the full commit path is
 * exercised. Errors thrown by `onOutput` are captured for the failure tests.
 */
function createUploader(
  root: string,
  opts: { fs?: FileSystem; statValue?: { size: number; mtimeMs: number } } = {},
) {
  const fs = opts.fs ?? nodeFileSystem;
  const statValue = opts.statValue ?? { size: 111, mtimeMs: 111 };
  const normalizes: Promise<void>[] = [];
  const errors: unknown[] = [];
  let jobCount = 0;
  let uploadCount = 0;

  const api = createTakeApi({
    registry: {
      create: async (kind: JobKind) => jobRecord(`job-${++jobCount}`, kind),
    } as unknown as JobRegistry,
    now: () => new Date("2026-11-23T10:00:00.000Z"),
    fs,
    stat: async () => statValue,
    runNormalize: async (input) => {
      const task = (async () => {
        uploadCount += 1;
        await writeFile(input.outputPath, `take bytes ${uploadCount}`);
        try {
          await input.onOutput?.(input.outputPath);
        } catch (error) {
          errors.push(error);
        }
      })();
      normalizes.push(task);
      await task;
    },
  });

  return {
    async upload(takeId: string, durationSeconds: number) {
      const response = await api.upload({
        root,
        takeId,
        durationSeconds,
        dataBase64: Buffer.from("x").toString("base64"),
      });
      expect(response.status).toBe(202);
      await Promise.all(normalizes);
    },
    errors,
  };
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-take-api-"));
  roots.push(root);
  await saveProject(nodeFileSystem, root, {
    schemaVersion: 1,
    id: "project-1",
    name: "Take",
    createdAt: "2026-11-23T09:00:00.000Z",
  });

  const normalized: NormalizeJobInput[] = [];
  const registry = {
    create: async (kind: JobKind): Promise<JobRecord> => ({
      id: "job-1",
      kind,
      status: "queued",
      createdAt: "2026-11-23T10:00:00.000Z",
      updatedAt: "2026-11-23T10:00:00.000Z",
      progress: 0,
      message: null,
      result: null,
      error: null,
    }),
  } as unknown as JobRegistry;

  const api = createTakeApi({
    registry,
    now: () => new Date("2026-11-23T10:00:00.000Z"),
    runNormalize: async (input) => {
      normalized.push(input);
      await writeFile(input.outputPath, "normalized bytes");
      await input.onOutput?.(input.outputPath);
    },
    stat: async () => ({ size: 123, mtimeMs: 456 }),
  });

  return { root, api, normalized };
}

describe("take api", () => {
  it("lists an empty manifest", async () => {
    const { api, root } = await setup();

    expect(await api.list({ root })).toEqual({ status: 200, body: { takes: [] } });
  });

  it("stores and activates an uploaded take", async () => {
    const { api, root, normalized } = await setup();

    const response = await api.upload({
      root,
      takeId: "take-1",
      durationSeconds: 12,
      dataBase64: Buffer.from("recorded bytes").toString("base64"),
    });

    expect(response.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.inputPath).toBe(uploadedTakePath(root, "take-1"));

    expect((await readTakes(nodeFileSystem, root)).takes).toEqual([
      {
        id: "take-1",
        fileName: "take-1.mp4",
        createdAt: "2026-11-23T10:00:00.000Z",
        durationSeconds: 12,
      },
    ]);
    const expectedRevision = await computeMediaRevision({
      mediaPath: normalizedTakePath(root, "take-1"),
      stat: async () => ({ size: 123, mtimeMs: 456 }),
    });
    expect((await openProject(nodeFileSystem, root)).media).toEqual({
      assetPath: "takes/take-1.mp4",
      mediaRevision: expectedRevision,
    });
    await expect(readFile(uploadedTakePath(root, "take-1"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a bad id, an empty body, and a bad duration", async () => {
    const { api, root } = await setup();

    expect(
      (await api.upload({ root, takeId: "bad/id", durationSeconds: 1, dataBase64: "eA==" })).status,
    ).toBe(400);
    expect(
      (await api.upload({ root, takeId: "take-2", durationSeconds: 1, dataBase64: "" })).status,
    ).toBe(400);
    expect(
      (await api.upload({ root, takeId: "take-3", durationSeconds: 0, dataBase64: "eA==" })).status,
    ).toBe(400);
  });

  it("answers 413 for an upload above the byte limit without writing it", async () => {
    const registry = {
      create: async () => {
        throw new Error("no job expected");
      },
    } as unknown as JobRegistry;
    const { root } = await setup();
    const api = createTakeApi({
      registry,
      maxUploadBytes: 16,
      runNormalize: async () => undefined,
    });

    const response = await api.upload({
      root,
      takeId: "take-big",
      durationSeconds: 1,
      dataBase64: "A".repeat(64),
    });

    expect(response.status).toBe(413);
    await expect(readFile(uploadedTakePath(root, "take-big"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("writes the decoded recording to a temporary file before the rename", async () => {
    const registry = {
      create: async (kind: JobKind): Promise<JobRecord> => ({
        id: "job-2",
        kind,
        status: "queued",
        createdAt: "2026-11-23T10:00:00.000Z",
        updatedAt: "2026-11-23T10:00:00.000Z",
        progress: 0,
        message: null,
        result: null,
        error: null,
      }),
    } as unknown as JobRegistry;
    const { root } = await setup();
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 7, 0x5a);
    let seen: Buffer | undefined;
    const api = createTakeApi({
      registry,
      runNormalize: async (input) => {
        seen = await readFile(input.inputPath);
      },
    });

    const response = await api.upload({
      root,
      takeId: "take-stream",
      durationSeconds: 3,
      dataBase64: bytes.toString("base64"),
    });

    expect(response.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen?.equals(bytes)).toBe(true);
    const leftovers = (await readdir(path.dirname(uploadedTakePath(root, "take-stream")))).filter(
      (name) => name.endsWith(".part"),
    );
    expect(leftovers).toEqual([]);
  });

  it("normalizes only short slugs", () => {
    expect(normalizeTakeId("take-2026-1")).toBe("take-2026-1");
    expect(() => normalizeTakeId("../escape")).toThrow(/slug/);
    expect(() => normalizeTakeId("UPPER")).toThrow(/slug/);
  });

  it("leaves the old take and manifest intact when the project save fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verbal-take-api-fail-"));
    roots.push(root);
    await saveProject(nodeFileSystem, root, {
      schemaVersion: 1,
      id: "project-1",
      name: "Take",
      createdAt: "2026-11-23T09:00:00.000Z",
    });
    await mkdir(path.join(root, "takes"), { recursive: true });
    await writeFile(path.join(root, "takes", "take-1.mp4"), "old take bytes");
    await addTake(nodeFileSystem, root, {
      id: "take-1",
      fileName: "take-1.mp4",
      createdAt: "2026-11-23T10:00:00.000Z",
      durationSeconds: 12,
    });

    const failingFs: FileSystem = {
      ...nodeFileSystem,
      async rename(from: string, to: string) {
        if (to.endsWith("project.json")) {
          throw new Error("save failed");
        }
        return nodeFileSystem.rename(from, to);
      },
    };

    const normalizes: Promise<void>[] = [];
    let normalizeError: unknown;
    const api = createTakeApi({
      registry: {
        create: async (kind: JobKind) => jobRecord("job-2", kind),
      } as unknown as JobRegistry,
      now: () => new Date("2026-11-23T10:00:00.000Z"),
      fs: failingFs,
      stat: async () => ({ size: 123, mtimeMs: 456 }),
      runNormalize: async (input) => {
        const task = (async () => {
          await writeFile(input.outputPath, "new take bytes");
          try {
            await input.onOutput?.(input.outputPath);
          } catch (error) {
            normalizeError = error;
          }
        })();
        normalizes.push(task);
        await task;
      },
    });

    const response = await api.upload({
      root,
      takeId: "take-1",
      durationSeconds: 12,
      dataBase64: Buffer.from("recorded bytes").toString("base64"),
    });
    expect(response.status).toBe(202);
    await Promise.all(normalizes);

    expect(normalizeError).toMatchObject({ message: "save failed" });
    expect(await readFile(path.join(root, "takes", "take-1.mp4"), "utf8")).toBe("old take bytes");
    expect((await readTakes(nodeFileSystem, root)).takes).toEqual([
      {
        id: "take-1",
        fileName: "take-1.mp4",
        createdAt: "2026-11-23T10:00:00.000Z",
        durationSeconds: 12,
      },
    ]);
    await expect(readFile(path.join(root, "takes", "take-1.job-2.mp4"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("a re-upload lands the new bytes at the canonical path and leaves no temporary", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verbal-take-api-reup-"));
    roots.push(root);
    await saveProject(nodeFileSystem, root, {
      schemaVersion: 1,
      id: "project-1",
      name: "Take",
      createdAt: "2026-11-23T09:00:00.000Z",
    });

    const uploader = createUploader(root);
    await uploader.upload("take-1", 12);
    expect(await readFile(path.join(root, "takes", "take-1.mp4"), "utf8")).toBe("take bytes 1");

    await uploader.upload("take-1", 20);

    expect(takeMediaPath(root, "take-1")).toBe(path.join(root, "takes", "take-1.mp4"));
    expect(await readFile(path.join(root, "takes", "take-1.mp4"), "utf8")).toBe("take bytes 2");
    await expect(readFile(path.join(root, "takes", "take-1.job-1.mp4"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(path.join(root, "takes", "take-1.job-2.mp4"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const takes = (await readTakes(nodeFileSystem, root)).takes;
    expect(takes).toHaveLength(1);
    expect(takes[0]?.fileName).toBe("take-1.mp4");
    expect(takes[0]?.durationSeconds).toBe(20);
  });

  it("keeps the old canonical bytes until the save commits", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verbal-take-api-gate-"));
    roots.push(root);
    await saveProject(nodeFileSystem, root, {
      schemaVersion: 1,
      id: "project-1",
      name: "Take",
      createdAt: "2026-11-23T09:00:00.000Z",
    });
    await mkdir(path.join(root, "takes"), { recursive: true });
    await writeFile(path.join(root, "takes", "take-1.mp4"), "old bytes");
    await addTake(nodeFileSystem, root, {
      id: "take-1",
      fileName: "take-1.mp4",
      createdAt: "2026-11-23T10:00:00.000Z",
      durationSeconds: 12,
    });

    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let saveStarted = false;
    const gatedFs: FileSystem = {
      ...nodeFileSystem,
      async rename(from: string, to: string) {
        if (to.endsWith("project.json")) {
          saveStarted = true;
          await saveGate;
        }
        return nodeFileSystem.rename(from, to);
      },
    };

    const normalizes: Promise<void>[] = [];
    const api = createTakeApi({
      registry: {
        create: async (kind: JobKind) => jobRecord("job-2", kind),
      } as unknown as JobRegistry,
      now: () => new Date("2026-11-23T10:00:00.000Z"),
      fs: gatedFs,
      stat: async () => ({ size: 222, mtimeMs: 222 }),
      runNormalize: async (input) => {
        const task = (async () => {
          await writeFile(input.outputPath, "new bytes");
          await input.onOutput?.(input.outputPath);
        })();
        normalizes.push(task);
        await task;
      },
    });

    const response = await api.upload({
      root,
      takeId: "take-1",
      durationSeconds: 20,
      dataBase64: Buffer.from("x").toString("base64"),
    });
    expect(response.status).toBe(202);

    await vi.waitFor(() => expect(saveStarted).toBe(true));
    expect(await readFile(path.join(root, "takes", "take-1.mp4"), "utf8")).toBe("old bytes");

    releaseSave();
    await Promise.all(normalizes);

    expect(await readFile(path.join(root, "takes", "take-1.mp4"), "utf8")).toBe("new bytes");
    await expect(readFile(path.join(root, "takes", "take-1.job-2.mp4"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("a failing final rename keeps the old bytes, removes the temporary, and fails the job", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verbal-take-api-renf-"));
    roots.push(root);
    await saveProject(nodeFileSystem, root, {
      schemaVersion: 1,
      id: "project-1",
      name: "Take",
      createdAt: "2026-11-23T09:00:00.000Z",
    });
    await mkdir(path.join(root, "takes"), { recursive: true });
    await writeFile(path.join(root, "takes", "take-1.mp4"), "old bytes");
    await addTake(nodeFileSystem, root, {
      id: "take-1",
      fileName: "take-1.mp4",
      createdAt: "2026-11-23T10:00:00.000Z",
      durationSeconds: 12,
    });

    const failingRenameFs: FileSystem = {
      ...nodeFileSystem,
      async rename(from: string, to: string) {
        if (to.endsWith("take-1.mp4")) {
          throw new Error("rename failed");
        }
        return nodeFileSystem.rename(from, to);
      },
    };

    const uploader = createUploader(root, { fs: failingRenameFs });
    await uploader.upload("take-1", 20);

    expect(uploader.errors).toHaveLength(1);
    expect(uploader.errors[0]).toMatchObject({ message: "rename failed" });
    expect(await readFile(path.join(root, "takes", "take-1.mp4"), "utf8")).toBe("old bytes");
    await expect(readFile(path.join(root, "takes", "take-1.job-1.mp4"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("a consumer resolving takeMediaPath after a re-upload finds the new file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verbal-take-api-consumer-"));
    roots.push(root);
    await saveProject(nodeFileSystem, root, {
      schemaVersion: 1,
      id: "project-1",
      name: "Take",
      createdAt: "2026-11-23T09:00:00.000Z",
    });

    const uploader = createUploader(root);
    await uploader.upload("take-1", 12);
    await uploader.upload("take-1", 20);

    const mediaPath = takeMediaPath(root, "take-1");
    expect(mediaPath).toBe(path.join(root, "takes", "take-1.mp4"));
    await expect(stat(mediaPath)).resolves.toMatchObject({ size: expect.any(Number) });
    expect(await readFile(mediaPath, "utf8")).toBe("take bytes 2");
  });
});
