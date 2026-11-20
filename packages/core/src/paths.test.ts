import { describe, expect, it } from "vitest";
import { assertRelativePath, resolveInsideProject } from "./paths";

describe("assertRelativePath", () => {
  it("accepts a simple relative path", () => {
    expect(assertRelativePath("assets/clip.mp4")).toBe("assets/clip.mp4");
  });

  it("normalises redundant segments", () => {
    expect(assertRelativePath("./assets//clip.mp4")).toBe("assets/clip.mp4");
  });

  it("rejects an empty path", () => {
    expect(() => assertRelativePath("")).toThrow(/empty/i);
  });

  it("rejects a whitespace-only path", () => {
    expect(() => assertRelativePath("   ")).toThrow(/empty/i);
  });

  it("rejects an absolute path", () => {
    expect(() => assertRelativePath("/etc/passwd")).toThrow(/absolute/i);
  });

  it("rejects parent traversal", () => {
    expect(() => assertRelativePath("../secrets")).toThrow(/outside/i);
  });

  it("rejects traversal hidden in the middle of a path", () => {
    expect(() => assertRelativePath("assets/../../secrets")).toThrow(/outside/i);
  });

  it("rejects a Windows drive path", () => {
    expect(() => assertRelativePath("C:\\Windows\\system32")).toThrow(/absolute/i);
  });

  it("accepts a dot in a filename", () => {
    expect(assertRelativePath("assets/take.1.mp4")).toBe("assets/take.1.mp4");
  });
});

describe("resolveInsideProject", () => {
  it("resolves a relative path under the project root", () => {
    expect(resolveInsideProject("/projects/demo", "assets/clip.mp4")).toBe(
      "/projects/demo/assets/clip.mp4",
    );
  });

  it("throws when a path escapes the root", () => {
    expect(() => resolveInsideProject("/projects/demo", "../demo-evil/clip.mp4")).toThrow(
      /outside/i,
    );
  });
});
