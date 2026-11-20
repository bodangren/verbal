import { createHash } from "node:crypto";
import { promises as nodeFs } from "node:fs";
import path from "node:path";

export type AssetSource = "generated" | "user";

export type AssetRecord = {
  /** sha256 of the asset bytes. */
  id: string;
  mediaType: string;
  source: AssetSource;
  prompt?: string;
  model?: string;
  createdAt: string;
};

/** Binary-capable file operations for the asset store. */
export type AssetFileSystem = {
  mkdir(path: string): Promise<void>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  writeText(path: string, data: string): Promise<void>;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
};

/** Immutable, content-addressed asset storage. */
export interface AssetStore {
  put(input: {
    data: Uint8Array;
    mediaType: string;
    source: AssetSource;
    prompt?: string;
    model?: string;
    createdAt: string;
  }): Promise<{ record: AssetRecord; created: boolean }>;
  get(id: string): Promise<Uint8Array | null>;
  record(id: string): Promise<AssetRecord | null>;
  has(id: string): Promise<boolean>;
  pathFor(id: string): string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashBytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function parseRecord(value: unknown): AssetRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, mediaType, source, prompt, model, createdAt } = value;

  if (
    typeof id !== "string" ||
    typeof mediaType !== "string" ||
    (source !== "generated" && source !== "user") ||
    typeof createdAt !== "string"
  ) {
    return null;
  }

  const record: AssetRecord = { id, mediaType, source, createdAt };
  if (typeof prompt === "string") {
    record.prompt = prompt;
  }
  if (typeof model === "string") {
    record.model = model;
  }
  return record;
}

/**
 * File-backed asset store.
 *
 * The id is the hash of the bytes, so writing the same image twice is a no-op
 * and a scene can never silently point at different content.
 */
export function createFileAssetStore(fs: AssetFileSystem, root: string): AssetStore {
  const pathFor = (id: string): string => path.join(root, id);
  const metaPath = (id: string): string => `${pathFor(id)}.json`;

  const readRecord = async (id: string): Promise<AssetRecord | null> => {
    try {
      const parsed: unknown = JSON.parse(await fs.readText(metaPath(id)));
      return parseRecord(parsed);
    } catch {
      return null;
    }
  };

  return {
    pathFor,

    async has(id) {
      return fs.exists(pathFor(id));
    },

    async get(id) {
      try {
        return await fs.readBytes(pathFor(id));
      } catch {
        return null;
      }
    },

    record: readRecord,

    async put(input) {
      const id = hashBytes(input.data);
      const existing = await readRecord(id);

      if (existing !== null) {
        return { record: existing, created: false };
      }

      await fs.mkdir(root);
      await fs.writeBytes(pathFor(id), input.data);

      const record: AssetRecord = {
        id,
        mediaType: input.mediaType,
        source: input.source,
        ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
        ...(input.model === undefined ? {} : { model: input.model }),
        createdAt: input.createdAt,
      };

      await fs.writeText(metaPath(id), `${JSON.stringify(record, null, 2)}\n`);

      return { record, created: true };
    },
  };
}

/** Production asset file system. */
export const nodeAssetFileSystem: AssetFileSystem = {
  async mkdir(path: string): Promise<void> {
    await nodeFs.mkdir(path, { recursive: true });
  },

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const handle = await nodeFs.open(path, "w");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
  },

  async readBytes(path: string): Promise<Uint8Array> {
    const buffer = await nodeFs.readFile(path);
    return new Uint8Array(buffer);
  },

  async writeText(path: string, data: string): Promise<void> {
    await nodeFs.writeFile(path, data, "utf8");
  },

  async readText(path: string): Promise<string> {
    return nodeFs.readFile(path, "utf8");
  },

  async exists(path: string): Promise<boolean> {
    try {
      await nodeFs.access(path);
      return true;
    } catch {
      return false;
    }
  },
};
