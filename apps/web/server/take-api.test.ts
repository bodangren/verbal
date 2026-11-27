import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  computeMediaRevision,
  nodeFileSystem,
  openProject,
  saveProject,
  type JobKind,
  type JobRecord,
  type JobRegistry,
} from "@verbal/core";
import { afterEach, describe, expect, it } from "vitest";
import type { NormalizeJobInput } from "./normalize-job";
import { createTakeApi, normalizeTakeId, normalizedTakePath, uploadedTakePath } from "./take-api";
import { readTakes } from "./take-store";

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
});
