import { describe, expect, it } from "vitest";
import type { FileSystem } from "./atomic";
import {
  PROJECT_SCHEMA_VERSION,
  ProjectError,
  createProject,
  openProject,
  parseProjectDocument,
  serializeProjectDocument,
  type ProjectErrorCode,
} from "./project";

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

function validDocument(): Record<string, unknown> {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "p-1",
    name: "Demo",
    createdAt: "2026-11-20T00:00:00.000Z",
    media: { assetPath: "assets/take.mp4" },
  };
}

function errorCode(run: () => unknown): ProjectErrorCode | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof ProjectError ? error.code : undefined;
  }
  return undefined;
}

describe("parseProjectDocument", () => {
  it("parses a valid document", () => {
    expect(parseProjectDocument(JSON.stringify(validDocument()))).toEqual(validDocument());
  });

  it("rejects invalid JSON", () => {
    expect(errorCode(() => parseProjectDocument("{not json"))).toBe("invalid-json");
  });

  it("rejects a document without a name", () => {
    const document = validDocument();
    delete document.name;

    expect(errorCode(() => parseProjectDocument(JSON.stringify(document)))).toBe(
      "invalid-document",
    );
  });

  it("rejects a non-numeric schema version", () => {
    expect(
      errorCode(() =>
        parseProjectDocument(JSON.stringify({ ...validDocument(), schemaVersion: "1" })),
      ),
    ).toBe("invalid-document");
  });

  it("rejects a newer schema version instead of guessing", () => {
    expect(
      errorCode(() =>
        parseProjectDocument(
          JSON.stringify({ ...validDocument(), schemaVersion: PROJECT_SCHEMA_VERSION + 1 }),
        ),
      ),
    ).toBe("unsupported-version");
  });

  it("rejects an absolute media path", () => {
    expect(
      errorCode(() =>
        parseProjectDocument(
          JSON.stringify({ ...validDocument(), media: { assetPath: "/etc/passwd" } }),
        ),
      ),
    ).toBe("invalid-path");
  });

  it("rejects a media path that escapes the project", () => {
    expect(
      errorCode(() =>
        parseProjectDocument(
          JSON.stringify({ ...validDocument(), media: { assetPath: "../take.mp4" } }),
        ),
      ),
    ).toBe("invalid-path");
  });
});

describe("serializeProjectDocument", () => {
  it("round-trips through parse", () => {
    const document = parseProjectDocument(JSON.stringify(validDocument()));

    expect(parseProjectDocument(serializeProjectDocument(document))).toEqual(document);
  });

  it("ends with a newline", () => {
    const document = parseProjectDocument(JSON.stringify(validDocument()));

    expect(serializeProjectDocument(document).endsWith("\n")).toBe(true);
  });
});

describe("createProject", () => {
  it("creates the project directories and the project document", async () => {
    const fs = new FakeFileSystem();

    const document = await createProject(fs, "/projects/demo", {
      name: "Demo",
      id: "p-1",
      now: () => new Date("2026-11-20T00:00:00.000Z"),
    });

    expect(document).toEqual({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: "p-1",
      name: "Demo",
      createdAt: "2026-11-20T00:00:00.000Z",
    });
    expect(fs.files.has("/projects/demo/project.json")).toBe(true);
    expect([...fs.directories]).toEqual(
      expect.arrayContaining([
        "/projects/demo",
        "/projects/demo/assets",
        "/projects/demo/cache",
        "/projects/demo/exports",
      ]),
    );
  });

  it("refuses to overwrite an existing project", async () => {
    const fs = new FakeFileSystem();
    fs.files.set("/projects/demo/project.json", "{}");

    await expect(createProject(fs, "/projects/demo", { name: "Demo" })).rejects.toMatchObject({
      code: "already-exists",
    });
    expect(fs.files.get("/projects/demo/project.json")).toBe("{}");
  });

  it("rejects a blank name", async () => {
    const fs = new FakeFileSystem();

    await expect(createProject(fs, "/projects/demo", { name: "   " })).rejects.toMatchObject({
      code: "invalid-document",
    });
  });
});

describe("openProject", () => {
  it("reads a project that createProject wrote", async () => {
    const fs = new FakeFileSystem();
    const created = await createProject(fs, "/projects/demo", { name: "Demo", id: "p-1" });

    await expect(openProject(fs, "/projects/demo")).resolves.toEqual(created);
  });

  it("reports a missing project as not-found", async () => {
    const fs = new FakeFileSystem();

    await expect(openProject(fs, "/projects/missing")).rejects.toMatchObject({ code: "not-found" });
  });
});
