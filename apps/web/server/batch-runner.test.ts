import { describe, expect, it, vi } from "vitest";
import { planBatch, type BatchProject } from "@verbal/core";
import { runBatch } from "./batch-runner";

function project(root: string, overrides: Partial<BatchProject> = {}): BatchProject {
  return { root, hasMedia: true, hasTranscript: false, ...overrides };
}

describe("runBatch", () => {
  it("transcribes one item at a time, in plan order", async () => {
    const order: string[] = [];
    let resolveFirst: () => void = () => undefined;

    const transcribe = vi.fn(async (root: string) => {
      order.push(`start:${root}`);
      if (root === "/a") {
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      order.push(`end:${root}`);
    });

    const plan = planBatch({ projects: [project("/a"), project("/b")] });
    const running = runBatch({ plan, transcribe });

    await Promise.resolve();
    expect(order).toEqual(["start:/a"]);

    resolveFirst();
    await running;

    expect(order).toEqual(["start:/a", "end:/a", "start:/b", "end:/b"]);
  });

  it("continues after a failed item and records the message", async () => {
    const transcribe = vi.fn(async (root: string) => {
      if (root === "/a") {
        throw new Error("provider exploded");
      }
    });

    const plan = planBatch({ projects: [project("/a"), project("/b")] });
    const { outcomes } = await runBatch({ plan, transcribe });

    expect(outcomes).toEqual([
      { root: "/a", status: "failed", detail: "provider exploded" },
      { root: "/b", status: "transcribed" },
    ]);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("does not transcribe a skipped item", async () => {
    const transcribe = vi.fn(async () => undefined);
    const plan = planBatch({
      projects: [project("/a", { hasTranscript: true }), project("/b", { hasMedia: false })],
    });

    const { outcomes } = await runBatch({ plan, transcribe });

    expect(transcribe).not.toHaveBeenCalled();
    expect(outcomes).toEqual([
      { root: "/a", status: "skipped", detail: "transcribed" },
      { root: "/b", status: "skipped", detail: "no-media" },
    ]);
  });

  it("reports progress after each item", async () => {
    const report = vi.fn();
    const plan = planBatch({ projects: [project("/a"), project("/b")] });

    await runBatch({ plan, transcribe: async () => undefined, report });

    expect(report).toHaveBeenNthCalledWith(1, { root: "/a", status: "transcribed" }, 1, 2);
    expect(report).toHaveBeenNthCalledWith(2, { root: "/b", status: "transcribed" }, 2, 2);
  });
});
