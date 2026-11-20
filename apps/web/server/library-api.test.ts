import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import handler from "../pages/api/projects/list";

function projectJson(name: string, createdAt: string) {
  return JSON.stringify({ schemaVersion: 1, id: name, name, createdAt });
}

describe("GET /api/projects/list", () => {
  let folder = "";
  let server: ReturnType<typeof createServer>;
  let base = "";

  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "verbal-library-"));
    for (const name of ["alpha", "beta"]) {
      await mkdir(path.join(folder, name), { recursive: true });
      await writeFile(
        path.join(folder, name, "project.json"),
        projectJson(name, name === "beta" ? "2026-11-21T00:00:00.000Z" : "2026-11-20T00:00:00.000Z"),
      );
    }
    await mkdir(path.join(folder, "stray"), { recursive: true });

    server = createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(folder, { recursive: true, force: true });
  });

  it("lists the projects newest first and skips non-projects", async () => {
    const response = await fetch(`${base}/api/projects/list?folder=${encodeURIComponent(folder)}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { projects: { name: string }[] };
    expect(body.projects.map((project) => project.name)).toEqual(["beta", "alpha"]);
  });

  it("reports a missing folder clearly", async () => {
    const response = await fetch(
      `${base}/api/projects/list?folder=${encodeURIComponent("/tmp/verbal-does-not-exist-xyz")}`,
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/does not exist/i);
  });

  it("rejects a relative folder and another method", async () => {
    const relative = await fetch(`${base}/api/projects/list?folder=relative%2Fpath`);
    expect(relative.status).toBe(400);

    const post = await fetch(`${base}/api/projects/list?folder=${encodeURIComponent(folder)}`, {
      method: "POST",
    });
    expect(post.status).toBe(405);
  });
});
