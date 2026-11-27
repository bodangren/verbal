import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AssetRecord } from "@verbal/compose";
import handler from "../pages/api/storyboard/prune";
import { createPruneApi } from "./prune-api";
import { createFakeFileSystem } from "./test-support";

/** A stored asset id is the SHA-256 hex of its bytes; the parser enforces it. */
const KEEP_ID = "a".repeat(64);

const ROOT = path.join(path.sep, "tmp", "verbal-prune");
const STORYBOARD = JSON.stringify({
  schemaVersion: 1,
  scenes: [
    {
      id: "s1",
      anchor: { startWordId: "w0", endWordId: "w0" },
      visual: "generated-image",
      layer: "full-frame",
      assetId: KEEP_ID,
    },
  ],
});

function record(id: string, createdAt: string, source: AssetRecord["source"] = "generated"): AssetRecord {
  return { id, mediaType: "image/png", source, createdAt };
}

describe("prune service", () => {
  function makeApi(options: { apply?: boolean } = {}) {
    const fs = createFakeFileSystem();
    fs.files.set(path.join(ROOT, "storyboard.json"), STORYBOARD);

    const removeAsset = vi.fn(async () => undefined);
    const api = createPruneApi({
      fs,
      listAssetIds: async () => [KEEP_ID, "old", "fresh"],
      readAssetRecord: async (_directory, id) =>
        id === "fresh"
          ? record(id, "2026-11-21T11:59:00.000Z")
          : record(id, "2026-10-01T00:00:00.000Z"),
      removeAsset,
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    return { api, removeAsset, apply: options.apply === true };
  }

  it("reports the plan without deleting when apply is absent", async () => {
    const { api, removeAsset } = makeApi();

    const result = await api.prune({ root: ROOT });

    expect(result.plan.keep).toEqual([KEEP_ID]);
    expect(result.plan.retained).toEqual(["fresh"]);
    expect(result.plan.prune).toEqual(["old"]);
    expect(result.deleted).toEqual([]);
    expect(removeAsset).not.toHaveBeenCalled();
  });

  it("deletes exactly the planned assets when apply is true", async () => {
    const { api, removeAsset } = makeApi({ apply: true });

    const result = await api.prune({ root: ROOT, apply: true });

    expect(result.deleted).toEqual(["old"]);
    expect(removeAsset).toHaveBeenCalledTimes(1);
    expect(removeAsset).toHaveBeenCalledWith(path.join(ROOT, "assets", "generated"), "old");
  });

  it("reports a project without a storyboard as not found", async () => {
    const api = createPruneApi({ fs: createFakeFileSystem() });

    await expect(api.prune({ root: ROOT })).rejects.toThrow(/no storyboard/i);
  });
});

describe("POST /api/storyboard/prune", () => {
  let root = "";
  let server: ReturnType<typeof createServer>;
  let base = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "verbal-prune-route-"));
    const generated = path.join(root, "assets", "generated");
    await mkdir(generated, { recursive: true });
    await writeFile(path.join(root, "storyboard.json"), STORYBOARD);

    for (const id of [KEEP_ID, "old"]) {
      await writeFile(path.join(generated, id), Buffer.from([1, 2, 3]));
      await writeFile(
        path.join(generated, `${id}.json`),
        JSON.stringify(record(id, "2026-10-01T00:00:00.000Z")),
      );
    }

    server = createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  it("reports the plan and deletes nothing by default", async () => {
    const response = await fetch(`${base}/api/storyboard/prune`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { plan: { prune: string[] }; deleted: string[] };
    expect(body.plan.prune).toEqual(["old"]);
    expect(body.deleted).toEqual([]);

    const kept = await readFile(path.join(root, "assets", "generated", "old"), "utf8").catch(() => null);
    expect(kept).not.toBeNull();
  });

  it("deletes the planned files when asked to apply", async () => {
    const response = await fetch(`${base}/api/storyboard/prune`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root, apply: true }),
    });

    const body = (await response.json()) as { deleted: string[] };
    expect(body.deleted).toEqual(["old"]);

    const removed = await readFile(path.join(root, "assets", "generated", "old"), "utf8").catch(() => null);
    expect(removed).toBeNull();

    const referenced = await readFile(path.join(root, "assets", "generated", KEEP_ID), "utf8").catch(
      () => null,
    );
    expect(referenced).not.toBeNull();
  });

  it("rejects a relative root and another method", async () => {
    const relative = await fetch(`${base}/api/storyboard/prune`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: "relative/path" }),
    });
    expect(relative.status).toBe(400);

    const get = await fetch(`${base}/api/storyboard/prune?root=${encodeURIComponent(root)}`);
    expect(get.status).toBe(405);
  });
});
