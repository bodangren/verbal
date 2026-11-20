import { describe, expect, it } from "vitest";
import { createProjectApi } from "./project-api";
import { createFakeFileSystem } from "./test-support";

describe("project API", () => {
  it("creates a project", async () => {
    const api = createProjectApi(createFakeFileSystem());

    const response = await api.create({ root: "/projects/demo", name: "Demo" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: "Demo" });
  });

  it("rejects a relative project root", async () => {
    const api = createProjectApi(createFakeFileSystem());

    expect((await api.create({ root: "demo", name: "Demo" })).status).toBe(400);
  });

  it("rejects a missing name", async () => {
    const api = createProjectApi(createFakeFileSystem());

    expect((await api.create({ root: "/projects/demo" })).status).toBe(400);
  });

  it("refuses to overwrite an existing project", async () => {
    const api = createProjectApi(createFakeFileSystem());
    await api.create({ root: "/projects/demo", name: "Demo" });

    expect((await api.create({ root: "/projects/demo", name: "Other" })).status).toBe(409);
  });

  it("opens an existing project", async () => {
    const api = createProjectApi(createFakeFileSystem());
    await api.create({ root: "/projects/demo", name: "Demo" });

    const response = await api.open({ root: "/projects/demo" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: "Demo" });
  });

  it("returns 404 for a missing project", async () => {
    const api = createProjectApi(createFakeFileSystem());

    expect((await api.open({ root: "/projects/none" })).status).toBe(404);
  });
});
