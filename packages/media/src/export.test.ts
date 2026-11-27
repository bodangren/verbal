import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, symlink, link, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildExportArgs,
  createProgressParser,
  ExportError,
  runExport,
  resolveExportDestination,
  type Spawner,
} from "./export";

const kept = [
  { start: 0, end: 0.4 },
  { start: 0.95, end: 3 },
];

describe("buildExportArgs", () => {
  it("builds a trim/concat filter chain for every kept range", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: true,
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filter).toContain("[0:v]trim=start=0.000000:end=0.400000");
    expect(filter).toContain("[0:v]trim=start=0.950000:end=3.000000");
    expect(filter).toContain("[0:a]atrim=start=0.000000:end=0.400000");
    expect(filter).toContain("concat=n=2:v=1:a=1[vout][aout]");
    expect(args).toContain("-map");
    expect(args.at(-1)).toBe("/media/out.mp4");
  });

  it("adds a silent audio input when the source has no audio and the recipe needs audio", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: false,
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";
    const silentIndex = args.findIndex((argument) => argument.startsWith("anullsrc"));

    expect(silentIndex).toBeGreaterThan(args.indexOf("/media/in.mp4"));
    expect(silentIndex).toBeLessThan(args.indexOf("-filter_complex"));
    expect(args[silentIndex - 2]).toBe("lavfi");
    expect(filter).toContain("[1:a]atrim=start=0.000000:end=");
    expect(filter).toContain("concat=n=2:v=1:a=1[vout][aout]");
    expect(args).toContain("[aout]");
    expect(args).toContain("-c:a");
  });

  it("keeps a hostile path as one argv entry and out of the filtergraph", () => {
    const hostile = '/media/"; rm -rf / #.mp4';

    const args = buildExportArgs({
      inputPath: hostile,
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: true,
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(args).toContain(hostile);
    expect(filter).not.toContain(hostile);
  });

  it("rejects an empty cut list", () => {
    expect(() =>
      buildExportArgs({
        inputPath: "/media/in.mp4",
        outputPath: "/media/out.mp4",
        kept: [],
        hasAudio: true,
      }),
    ).toThrow(ExportError);
  });

  it("allows encoder overrides", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: true,
      codecs: { videoCodec: "mpeg4", videoArgs: ["-q:v", "5"] },
    });

    expect(args).toContain("mpeg4");
    expect(args).toContain("-q:v");
  });

  it("renders an inserted silence as black video and silent audio", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      items: [
        { kind: "video", startSeconds: 0, endSeconds: 1 },
        { kind: "silence", durationSeconds: 1.5 },
        { kind: "video", startSeconds: 1, endSeconds: 2 },
      ],
      hasAudio: true,
      video: { width: 1920, height: 1080, fps: 30 },
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filter).toContain("color=c=black:s=1920x1080:r=30.000000:d=1.500000");
    expect(filter).toContain("anullsrc=r=48000:cl=stereo:d=1.500000");
    expect(filter).toContain("concat=n=3:v=1:a=1[vout][aout]");
  });

  it("rejects a silence item without source video geometry", () => {
    expect(() =>
      buildExportArgs({
        inputPath: "/media/in.mp4",
        outputPath: "/media/out.mp4",
        items: [
          { kind: "video", startSeconds: 0, endSeconds: 1 },
          { kind: "silence", durationSeconds: 1 },
        ],
        hasAudio: true,
      }),
    ).toThrow(ExportError);
  });

  it("builds argv from video-only items without video geometry", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      items: [
        { kind: "video", startSeconds: 0, endSeconds: 0.4 },
        { kind: "video", startSeconds: 0.95, endSeconds: 3 },
      ],
      hasAudio: true,
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filter).toContain("[0:v]trim=start=0.000000:end=0.400000");
    expect(filter).toContain("concat=n=2:v=1:a=1[vout][aout]");
  });

  it("normalises the sample aspect ratio of every concat leg", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      items: [
        { kind: "video", startSeconds: 0, endSeconds: 1 },
        { kind: "silence", durationSeconds: 1 },
        { kind: "video", startSeconds: 1, endSeconds: 2 },
      ],
      hasAudio: true,
      video: { width: 120, height: 160, fps: 25 },
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filter.match(/setsar=1/g)).toHaveLength(3);
  });

  it("scales video legs and sizes the silence to the display geometry", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      items: [
        { kind: "video", startSeconds: 0, endSeconds: 1 },
        { kind: "silence", durationSeconds: 1 },
      ],
      hasAudio: true,
      video: { width: 120, height: 160, fps: 25 },
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filter).toContain("scale=120:160");
    expect(filter).toContain("fps=25.000000");
    expect(filter).toContain("color=c=black:s=120x160:r=25.000000");
  });

  it("keeps the argv byte-identical for a plain square-pixel source", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      items: [
        { kind: "video", startSeconds: 0, endSeconds: 1 },
        { kind: "silence", durationSeconds: 1 },
        { kind: "video", startSeconds: 1, endSeconds: 2 },
      ],
      hasAudio: true,
      video: { width: 1920, height: 1080, fps: 30 },
    });

    expect(args).toMatchInlineSnapshot(`
      [
        "-y",
        "-i",
        "/media/in.mp4",
        "-filter_complex",
        "[0:v]trim=start=0.000000:end=1.000000,setpts=PTS-STARTPTS,scale=1920:1080,setsar=1,fps=30.000000[v0];[0:a]atrim=start=0.000000:end=1.000000,asetpts=PTS-STARTPTS[a0];color=c=black:s=1920x1080:r=30.000000:d=1.000000,setpts=PTS-STARTPTS,setsar=1[v1];anullsrc=r=48000:cl=stereo:d=1.000000[a1];[0:v]trim=start=1.000000:end=2.000000,setpts=PTS-STARTPTS,scale=1920:1080,setsar=1,fps=30.000000[v2];[0:a]atrim=start=1.000000:end=2.000000,asetpts=PTS-STARTPTS[a2];[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[vout][aout]",
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-crf",
        "20",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-progress",
        "pipe:1",
        "-nostats",
        "/media/out.mp4",
      ]
    `);
  });
});

describe("createProgressParser", () => {
  it("maps out_time_ms to a fraction of the expected duration", () => {
    const seen: number[] = [];
    const feed = createProgressParser(10, (progress) => seen.push(progress.percent));

    feed("out_time_ms=2500000\nprogress=continue\n");

    expect(seen.at(-1)).toBeCloseTo(0.25, 5);
  });

  it("buffers a line split across chunks", () => {
    const seen: number[] = [];
    const feed = createProgressParser(10, (progress) => seen.push(progress.percent));

    feed("out_time_ms=5");
    expect(seen).toEqual([]);

    feed("000000\nprogress=continue\n");
    expect(seen.at(-1)).toBeCloseTo(0.5, 5);
  });

  it("reports completion at progress=end", () => {
    const seen: number[] = [];
    const feed = createProgressParser(10, (progress) => seen.push(progress.percent));

    feed("progress=end\n");

    expect(seen.at(-1)).toBe(1);
  });

  it("never exceeds one", () => {
    const seen: number[] = [];
    const feed = createProgressParser(10, (progress) => seen.push(progress.percent));

    feed("out_time_ms=99999999\n");

    expect(seen.at(-1)).toBe(1);
  });
});

describe("runExport", () => {
  for (const extension of [".mp4", ".webm", ".mkv", ".wav", ".m4a"]) {
    it(`keeps ${extension} at the end of the partial output path`, async () => {
      let args: readonly string[] = [];
      await runExport({
        inputPath: "/media/in.mp4",
        outputPath: `/media/out${extension}`,
        jobId: "job",
        kept,
        hasAudio: true,
        spawner: async (_file, nextArgs) => { args = nextArgs; },
        rename: async () => undefined,
        unlink: async () => undefined,
      });
      expect(args.at(-1)).toBe(`/media/out.job.partial${extension}`);
      expect(args).not.toContain("-f");
    });
  }

  it("does not overwrite an existing destination when the runner fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "export-"));
    try {
      const destination = join(directory, "out.mp4");
      await writeFile(destination, "old");
      await expect(runExport({
        inputPath: join(directory, "source.mp4"),
        outputPath: destination,
        jobId: "job",
        kept,
        hasAudio: true,
        spawner: async () => { throw new Error("failed"); },
      })).rejects.toThrow("failed");
      expect(await (await import("node:fs/promises")).readFile(destination, "utf8")).toBe("old");
      expect(await (await import("node:fs/promises")).readdir(directory)).toEqual(["out.mp4"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("forwards progress reported by the spawner", async () => {
    const seen: number[] = [];
    const spawner: Spawner = async (_file, _args, options) => {
      options.onStdout?.("out_time_ms=10000000\nprogress=end\n");
    };

    await runExport({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: true,
      spawner,
      rename: async () => undefined,
      onProgress: (progress) => seen.push(progress.percent),
    });

    expect(seen.at(-1)).toBe(1);
  });

  it("removes a partial output when the export fails", async () => {
    const removed: string[] = [];
    const spawner: Spawner = async () => {
      throw new ExportError("cancelled", "export cancelled");
    };

    await expect(
      runExport({
        inputPath: "/media/in.mp4",
        outputPath: "/media/out.mp4",
        kept,
        hasAudio: true,
        spawner,
        jobId: "test-job",
        unlink: async (path) => {
          removed.push(path);
        },
      }),
    ).rejects.toBeInstanceOf(ExportError);

    expect(removed).toEqual(["/media/out.test-job.partial.mp4"]);
  });

  it("does not remove the output on success", async () => {
    const removed: string[] = [];
    const renamed: string[][] = [];
    const spawner: Spawner = async () => undefined;

    await runExport({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: true,
      spawner,
      jobId: "test-job",
      unlink: async (path) => {
        removed.push(path);
      },
      rename: async (from, to) => {
        renamed.push([from, to]);
      },
    });

    expect(removed).toEqual([]);
    expect(renamed).toEqual([["/media/out.test-job.partial.mp4", "/media/out.mp4"]]);
  });

  it("skips the rename and removes the partial when beforeRename returns false", async () => {
    const removed: string[] = [];
    const renamed: string[][] = [];
    const spawner: Spawner = async () => undefined;

    await runExport({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: true,
      spawner,
      jobId: "test-job",
      unlink: async (path) => {
        removed.push(path);
      },
      rename: async (from, to) => {
        renamed.push([from, to]);
      },
      beforeRename: () => false,
    });

    expect(removed).toEqual(["/media/out.test-job.partial.mp4"]);
    expect(renamed).toEqual([]);
  });
});

describe("resolveExportDestination", () => {
  it("rejects file symlinks, hardlinks, and symlinked directories but accepts distinct case paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "export-path-"));
    try {
      const source = join(directory, "Video.mp4");
      const distinctCase = join(directory, "video.mp4");
      const fileAlias = join(directory, "file-link.mp4");
      const hardAlias = join(directory, "hard-link.mp4");
      const linkedDirectory = join(directory, "linked");
      await writeFile(source, "source");
      await writeFile(distinctCase, "other");
      await symlink(source, fileAlias);
      await link(source, hardAlias);
      await mkdir(linkedDirectory);
      const directoryAlias = join(directory, "directory-link");
      await symlink(linkedDirectory, directoryAlias);
      const directorySource = join(linkedDirectory, "source.mp4");
      await symlink(source, directorySource);
      await expect(resolveExportDestination(source, fileAlias)).rejects.toThrow("outputPath must not be the source video");
      await expect(resolveExportDestination(source, hardAlias)).rejects.toThrow("outputPath must not be the source video");
      await expect(resolveExportDestination(source, join(directoryAlias, "source.mp4"))).rejects.toThrow("outputPath must not be the source video");
      await expect(resolveExportDestination(source, distinctCase)).resolves.toBe(distinctCase);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects when the destination realpath fails with an unexpected error", async () => {
    const realpath = async (value: string) => {
      if (value.endsWith("/out.mp4")) {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      }
      return value;
    };

    await expect(
      resolveExportDestination("/media/in.mp4", "/media/out.mp4", realpath),
    ).rejects.toThrow("cannot check the export destination: EACCES");
  });

  it("resolves a not-yet-created destination whose parent exists", async () => {
    const realpath = async (value: string) => {
      if (value === "/media/out.mp4") {
        throw Object.assign(new Error("no such file"), { code: "ENOENT" });
      }
      return value;
    };

    await expect(
      resolveExportDestination("/media/in.mp4", "/media/out.mp4", realpath),
    ).resolves.toBe("/media/out.mp4");
  });

  it("walks up to the nearest existing ancestor for a missing parent", async () => {
    const realpath = async (value: string) => {
      if (value === "/media" || value === "/media/in.mp4") {
        return value;
      }
      throw Object.assign(new Error("no such file"), { code: "ENOENT" });
    };

    await expect(
      resolveExportDestination("/media/in.mp4", "/media/new/final.mp4", realpath),
    ).resolves.toBe("/media/new/final.mp4");
  });

  it("rejects when the nearest existing ancestor resolves to the source", async () => {
    const realpath = async (value: string) => {
      if (value === "/media/in.mp4") {
        return "/media/in.mp4";
      }
      if (value === "/alias") {
        return "/media";
      }
      throw Object.assign(new Error("no such file"), { code: "ENOENT" });
    };

    await expect(
      resolveExportDestination("/media/in.mp4", "/alias/in.mp4", realpath),
    ).rejects.toThrow("outputPath must not be the source video");
  });

  it("rejects when the dev+ino stat fails with an unexpected error", async () => {
    const stat = async () => {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    };

    await expect(
      resolveExportDestination("/media/in.mp4", "/media/out.mp4", async (value) => value, {
        stat,
      }),
    ).rejects.toThrow("cannot check the export destination: EACCES");
  });
});
