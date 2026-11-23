import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const rootStart = css.indexOf(":root");
const rootEnd = css.indexOf("}", rootStart);
const outsideRoot = rootEnd === -1 ? css : css.slice(rootEnd + 1);

describe("globals.css design conformance", () => {
  it("uses only the DESIGN.md type scale (no 10px)", () => {
    expect(outsideRoot).not.toMatch(/font-size:\s*10px/);
  });

  it("uses flat surfaces, not gradients", () => {
    expect(outsideRoot).not.toMatch(/gradient\(/);
  });

  it("never animates every property", () => {
    expect(outsideRoot).not.toMatch(/transition:\s*all/);
  });

  it("uses tokens instead of raw hex colours outside :root", () => {
    const raw = [...outsideRoot.matchAll(/#[0-9a-fA-F]{3,8}/g)].map(
      (match) => match[0],
    );

    expect(raw).toEqual([]);
  });
});
