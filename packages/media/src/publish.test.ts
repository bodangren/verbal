import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { partialPathFor, publishAtomically } from "./publish";

describe("partialPathFor", () => {
  it("keeps the extension at the end of the partial path", () => {
    expect(partialPathFor("/out/final.mp4", "job")).toBe("/out/final.job.partial.mp4");
    expect(partialPathFor("/out/final.webm", "job")).toBe("/out/final.job.partial.webm");
    expect(partialPathFor("/out/final.mkv", "job")).toBe("/out/final.job.partial.mkv");
    expect(partialPathFor("/out/final.wav", "job")).toBe("/out/final.job.partial.wav");
    expect(partialPathFor("/out/final", "job")).toBe("/out/final.job.partial");
  });
});

describe("publishAtomically", () => {
  it("writes the partial, renames it, then runs afterRename in order", async () => {
    const events: string[] = [];

    await publishAtomically({
      outputPath: "/out/final.mp4",
      jobId: "job",
      write: async (partialPath) => {
        events.push(`write:${partialPath}`);
      },
      rename: async (from, to) => {
        events.push(`rename:${from}->${to}`);
      },
      afterRename: async () => {
        events.push("afterRename");
      },
    });

    expect(events).toEqual([
      "write:/out/final.job.partial.mp4",
      "rename:/out/final.job.partial.mp4->/out/final.mp4",
      "afterRename",
    ]);
  });

  it("unlinks only the partial and skips rename and afterRename on failure", async () => {
    const events: string[] = [];

    await expect(
      publishAtomically({
        outputPath: "/out/final.mp4",
        jobId: "job",
        write: async () => {
          throw new Error("failed");
        },
        rename: async (from, to) => {
          events.push(`rename:${from}->${to}`);
        },
        unlink: async (path) => {
          events.push(`unlink:${path}`);
        },
        afterRename: async () => {
          events.push("afterRename");
        },
      }),
    ).rejects.toThrow("failed");

    expect(events).toEqual(["unlink:/out/final.job.partial.mp4"]);
  });

  it("leaves an existing destination byte-identical and removes only the partial on failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "publish-"));
    try {
      const destination = join(directory, "out.mp4");
      await writeFile(destination, "old");

      await expect(
        publishAtomically({
          outputPath: destination,
          jobId: "job",
          write: async (partialPath) => {
            await writeFile(partialPath, "new-bytes");
            throw new Error("failed after partial write");
          },
        }),
      ).rejects.toThrow("failed after partial write");

      expect(await readFile(destination, "utf8")).toBe("old");
      expect(await readdir(directory)).toEqual(["out.mp4"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("renames a real partial over the destination on success", async () => {
    const directory = await mkdtemp(join(tmpdir(), "publish-"));
    try {
      const destination = join(directory, "out.mp4");
      await writeFile(destination, "old");

      await publishAtomically({
        outputPath: destination,
        jobId: "job",
        write: async (partialPath) => {
          await writeFile(partialPath, "new-bytes");
        },
      });

      expect(await readFile(destination, "utf8")).toBe("new-bytes");
      expect(await readdir(directory)).toEqual(["out.mp4"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
