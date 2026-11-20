import { describe, expect, it } from "vitest";
import { planBatch, type BatchProject } from "./batch";

function project(root: string, overrides: Partial<BatchProject> = {}): BatchProject {
  return { root, hasMedia: true, hasTranscript: false, ...overrides };
}

describe("planBatch", () => {
  it("plans a project that has no transcript", () => {
    const { items, skipped } = planBatch({ projects: [project("/a")] });

    expect(items).toEqual([{ root: "/a", action: "transcribe" }]);
    expect(skipped).toEqual([]);
  });

  it("skips a project that already has a transcript", () => {
    const { items, skipped } = planBatch({
      projects: [project("/a", { hasTranscript: true })],
    });

    expect(items).toEqual([{ root: "/a", action: "skip", reason: "transcribed" }]);
    expect(skipped).toEqual([{ root: "/a", reason: "transcribed" }]);
  });

  it("transcribes a transcribed project when forced", () => {
    const { items, skipped } = planBatch({
      projects: [project("/a", { hasTranscript: true })],
      force: true,
    });

    expect(items).toEqual([{ root: "/a", action: "transcribe" }]);
    expect(skipped).toEqual([]);
  });

  it("skips a project without media even when forced", () => {
    const { items, skipped } = planBatch({
      projects: [project("/a", { hasMedia: false })],
      force: true,
    });

    expect(items).toEqual([{ root: "/a", action: "skip", reason: "no-media" }]);
    expect(skipped).toEqual([{ root: "/a", reason: "no-media" }]);
  });

  it("collapses a duplicated root to its first position", () => {
    const { items } = planBatch({
      projects: [project("/a"), project("/b"), project("/a")],
    });

    expect(items.map((item) => item.root)).toEqual(["/a", "/b"]);
  });

  it("preserves the given order", () => {
    const { items } = planBatch({
      projects: [project("/c"), project("/a"), project("/b")],
    });

    expect(items.map((item) => item.root)).toEqual(["/c", "/a", "/b"]);
  });

  it("plans nothing for an empty list", () => {
    expect(planBatch({ projects: [] })).toEqual({ items: [], skipped: [] });
  });
});
