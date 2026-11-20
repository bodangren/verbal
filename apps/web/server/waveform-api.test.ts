import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import handler from "../pages/api/media/waveform";
import { createWaveformApi } from "./waveform-api";
import { createFakeFileSystem } from "./test-support";

const ROOT = "/tmp/verbal-waveform";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function projectFs(media?: Record<string, string>) {
  const fs = createFakeFileSystem();
  fs.files.set(
    `${ROOT}/project.json`,
    JSON.stringify({
      schemaVersion: 1,
      id: "p1",
      name: "Wave",
      createdAt: "2026-11-21T00:00:00.000Z",
      ...(media === undefined ? {} : { media }),
    }),
  );
  return fs;
}

describe("waveform service", () => {
  it("renders once and reuses the cached image afterwards", async () => {
    const fs = projectFs({ assetPath: "assets/take.mp4" });
    const render = vi.fn(async () => undefined);
    let cached = false;

    const api = createWaveformApi({
      fs,
      stat: async () => ({ size: 10, mtimeMs: 1 }),
      exists: async () => cached,
      render,
      read: async () => PNG,
      mkdir: async () => undefined,
    });

    const first = await api.image({ root: ROOT });
    expect(render).toHaveBeenCalledTimes(1);
    expect(first.cachePath).toContain("/cache/waveform-");
    expect(first.bytes).toEqual(PNG);

    cached = true;
    await api.image({ root: ROOT });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("keys the cache on the source revision, so a re-import re-renders", async () => {
    const fs = projectFs({ assetPath: "assets/take.mp4" });
    const render = vi.fn(async () => undefined);
    let mtimeMs = 1;

    const api = createWaveformApi({
      fs,
      stat: async () => ({ size: 10, mtimeMs }),
      exists: async () => true,
      render,
      read: async () => PNG,
      mkdir: async () => undefined,
    });

    const before = await api.image({ root: ROOT });
    mtimeMs = 2;
    const after = await api.image({ root: ROOT });

    expect(after.cachePath).not.toBe(before.cachePath);
  });

  it("reports a project without media as not found", async () => {
    const api = createWaveformApi({ fs: projectFs() });

    await expect(api.image({ root: ROOT })).rejects.toThrow(/no media/i);
  });
});

describe("GET /api/media/waveform", () => {
  let server: ReturnType<typeof createServer>;
  let base = "";

  beforeAll(async () => {
    server = createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("rejects a relative root before rendering anything", async () => {
    const response = await fetch(`${base}/api/media/waveform?root=relative%2Fpath`);
    expect(response.status).toBe(400);
  });

  it("rejects another method", async () => {
    const response = await fetch(`${base}/api/media/waveform?root=${encodeURIComponent(ROOT)}`, {
      method: "POST",
    });
    expect(response.status).toBe(405);
  });
});
