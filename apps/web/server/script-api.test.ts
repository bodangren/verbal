import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createScriptApi } from "./script-api";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "verbal-script-"));
  roots.push(root);
  return root;
}

describe("script api", () => {
  it("reads an empty script when the file is missing", async () => {
    expect(await createScriptApi().read(await tempRoot())).toBe("");
  });

  it("writes and reads a script", async () => {
    const root = await tempRoot();
    const api = createScriptApi();

    await api.write({ root, script: "Hello.\nWorld." });

    expect(await api.read(root)).toBe("Hello.\nWorld.");
    expect(await readFile(path.join(root, "script.md"), "utf8")).toBe("Hello.\nWorld.");
  });

  it("rejects a relative root", async () => {
    await expect(
      createScriptApi().write({ root: "relative/path", script: "x" }),
    ).rejects.toThrow(/absolute/);
  });

  it("rejects a non-string script", async () => {
    await expect(
      createScriptApi().write({ root: await tempRoot(), script: 3 }),
    ).rejects.toThrow(/script/);
  });

  it("rejects a script over the cap", async () => {
    await expect(
      createScriptApi().write({
        root: await tempRoot(),
        script: "x".repeat(200_001),
      }),
    ).rejects.toThrow(/200000/);
  });
});
