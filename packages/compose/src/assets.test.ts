import { describe, expect, it } from "vitest";
import {
  createFileAssetStore,
  type AssetFileSystem,
} from "./assets";

class FakeAssetFileSystem implements AssetFileSystem {
  readonly files = new Map<string, string>();
  readonly bytes = new Map<string, Uint8Array>();

  async mkdir(): Promise<void> {
    // Directories are implicit in this fake.
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.bytes.set(path, data);
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const data = this.bytes.get(path);
    if (data === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return data;
  }

  async writeText(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }

  async readText(path: string): Promise<string> {
    const data = this.files.get(path);
    if (data === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return data;
  }

  async exists(path: string): Promise<boolean> {
    return this.bytes.has(path) || this.files.has(path);
  }
}

const CREATED_AT = "2026-11-20T00:00:00.000Z";

function input(data: number[], overrides: Record<string, unknown> = {}) {
  return {
    data: Uint8Array.from(data),
    mediaType: "image/png",
    source: "generated" as const,
    prompt: "a diagram",
    model: "image-1",
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("createFileAssetStore", () => {
  it("addresses assets by the hash of their bytes", async () => {
    const fs = new FakeAssetFileSystem();
    const store = createFileAssetStore(fs, "/assets/generated");

    const first = await store.put(input([1, 2, 3]));

    expect(first.created).toBe(true);
    expect(first.record.id).toMatch(/^[0-9a-f]{64}$/);
    expect(store.pathFor(first.record.id)).toBe(`/assets/generated/${first.record.id}`);
    const bytes = await store.get(first.record.id);
    expect(bytes).not.toBeNull();
    expect(Array.from(bytes ?? new Uint8Array())).toEqual([1, 2, 3]);
  });

  it("is idempotent for identical bytes", async () => {
    const fs = new FakeAssetFileSystem();
    const store = createFileAssetStore(fs, "/assets/generated");

    const first = await store.put(input([1, 2, 3]));
    const second = await store.put(input([1, 2, 3]));

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(fs.bytes.size).toBe(1);
  });

  it("gives different bytes different ids", async () => {
    const fs = new FakeAssetFileSystem();
    const store = createFileAssetStore(fs, "/assets/generated");

    const first = await store.put(input([1, 2, 3]));
    const second = await store.put(input([4, 5, 6]));

    expect(second.record.id).not.toBe(first.record.id);
  });

  it("records provenance alongside the bytes", async () => {
    const fs = new FakeAssetFileSystem();
    const store = createFileAssetStore(fs, "/assets/generated");

    const { record } = await store.put(input([7]));
    const stored = await store.record(record.id);

    expect(stored).toEqual({
      id: record.id,
      mediaType: "image/png",
      source: "generated",
      prompt: "a diagram",
      model: "image-1",
      createdAt: CREATED_AT,
    });
  });

  it("reports a missing asset", async () => {
    const store = createFileAssetStore(new FakeAssetFileSystem(), "/assets");

    expect(await store.get("missing")).toBeNull();
    expect(await store.has("missing")).toBe(false);
  });
});
