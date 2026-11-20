import { describe, expect, it } from "vitest";
import { JobRegistry, createMemoryJobStore } from "@verbal/core";
import { createJobApi } from "./jobs-api";

const now = () => new Date("2026-11-20T00:00:00.000Z");

async function makeApi() {
  const registry = await JobRegistry.open(createMemoryJobStore(), now);
  return { registry, api: createJobApi(registry) };
}

describe("job API", () => {
  it("lists an empty registry", async () => {
    const { api } = await makeApi();

    expect(api.list()).toEqual({ status: 200, body: { jobs: [] } });
  });

  it("creates a job", async () => {
    const { api } = await makeApi();

    const response = await api.create({ kind: "export" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ kind: "export", status: "queued" });
  });

  it("rejects an unknown kind", async () => {
    const { api } = await makeApi();

    const response = await api.create({ kind: "render-everything" });

    expect(response.status).toBe(400);
  });

  it("rejects a non-object body", async () => {
    const { api } = await makeApi();

    const response = await api.create("export");

    expect(response.status).toBe(400);
  });

  it("returns a job by id", async () => {
    const { api } = await makeApi();
    const created = await api.create({ kind: "probe" });
    const id = (created.body as { id: string }).id;

    expect(api.get(id).status).toBe(200);
  });

  it("returns 404 for an unknown job", async () => {
    const { api } = await makeApi();

    expect(api.get("nope")).toEqual({ status: 404, body: { error: "job not found" } });
  });

  it("cancels a job", async () => {
    const { api } = await makeApi();
    const created = await api.create({ kind: "export" });
    const id = (created.body as { id: string }).id;

    const response = await api.cancel(id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "cancelled" });
  });

  it("returns 409 when a job cannot be cancelled", async () => {
    const { registry, api } = await makeApi();
    const created = await api.create({ kind: "export" });
    const id = (created.body as { id: string }).id;
    await registry.start(id);
    await registry.complete(id);

    expect((await api.cancel(id)).status).toBe(409);
  });
});
