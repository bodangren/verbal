// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pagesDir = fileURLToPath(new URL("../pages", import.meta.url));

describe("pages directory hygiene", () => {
  it("keeps test code out of production routes", () => {
    const offenders: string[] = [];

    for (const relative of readdirSync(pagesDir, { recursive: true, encoding: "utf8" })) {
      const file = path.join(pagesDir, relative);
      const isTestName = /\.(test|spec)\.[jt]sx?$/.test(relative);
      const isSource = /\.[jt]sx?$/.test(relative);
      const hasVitest =
        isSource && statSync(file).isFile() && readFileSync(file, "utf8").includes('from "vitest"');

      if (isTestName || hasVitest) {
        offenders.push(file);
      }
    }

    expect(offenders, `test code in pages: ${offenders.join(", ")}`).toEqual([]);
  });
});
