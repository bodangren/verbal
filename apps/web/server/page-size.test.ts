// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexPath = fileURLToPath(new URL("../pages/index.tsx", import.meta.url));

describe("page size ratchet", () => {
  it("keeps index.tsx below the extracted-workspace ceiling", () => {
    const lines = readFileSync(indexPath, "utf8").split("\n").length;
    expect(lines).toBeLessThan(849);
  });
});
