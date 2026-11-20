import { describe, expect, it } from "vitest";
import {
  buildExportArgs,
  createProgressParser,
  ExportError,
  runExport,
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

  it("omits the audio chain when the source has no audio", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: false,
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filter).toContain("concat=n=2:v=1:a=0[vout]");
    expect(filter).not.toContain("atrim");
    expect(args).not.toContain("[aout]");
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
        unlink: async (path) => {
          removed.push(path);
        },
      }),
    ).rejects.toBeInstanceOf(ExportError);

    expect(removed).toEqual(["/media/out.mp4"]);
  });

  it("does not remove the output on success", async () => {
    const removed: string[] = [];
    const spawner: Spawner = async () => undefined;

    await runExport({
      inputPath: "/media/in.mp4",
      outputPath: "/media/out.mp4",
      kept,
      hasAudio: true,
      spawner,
      unlink: async (path) => {
        removed.push(path);
      },
    });

    expect(removed).toEqual([]);
  });
});
