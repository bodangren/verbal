import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { rendererDependenciesInstalled } from "./remotion-renderer";

const rendererPath = "/work/tools/remotion/render.mjs";
const bundlerPath = path.join(
  path.dirname(rendererPath),
  "node_modules",
  "@remotion",
  "bundler",
);

describe("rendererDependenciesInstalled", () => {
  it("is true when the bundler folder exists beside the renderer", () => {
    const exists = vi.fn((candidate: string) => candidate === bundlerPath);

    expect(rendererDependenciesInstalled(rendererPath, exists)).toBe(true);
    expect(exists).toHaveBeenCalledWith(bundlerPath);
  });

  it("is false when the bundler folder is missing", () => {
    const exists = vi.fn(() => false);

    expect(rendererDependenciesInstalled(rendererPath, exists)).toBe(false);
  });
});
