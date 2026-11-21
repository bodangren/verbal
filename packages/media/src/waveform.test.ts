import { describe, expect, it } from "vitest";
import { MediaError } from "./import";
import { buildFlatWaveformArgs, buildWaveformArgs, normaliseWaveform } from "./waveform";

describe("normaliseWaveform", () => {
  it("defaults the size and colour", () => {
    expect(normaliseWaveform()).toEqual({ width: 1200, height: 120, color: "white" });
  });

  it("clamps an out-of-range size instead of honouring it", () => {
    expect(normaliseWaveform({ width: 10, height: 1 })).toMatchObject({ width: 64, height: 16 });
    expect(normaliseWaveform({ width: 99999, height: 9999 })).toMatchObject({
      width: 4096,
      height: 512,
    });
  });

  it("falls back to the defaults for non-finite sizes", () => {
    expect(
      normaliseWaveform({ width: Number.NaN, height: Number.POSITIVE_INFINITY }),
    ).toMatchObject({ width: 1200, height: 120 });
  });

  it("accepts hex and named colours", () => {
    expect(normaliseWaveform({ color: "#ff0066" }).color).toBe("#ff0066");
    expect(normaliseWaveform({ color: "#ff006680" }).color).toBe("#ff006680");
    expect(normaliseWaveform({ color: "cyan" }).color).toBe("cyan");
  });

  it("rejects a colour that could reach the filtergraph as something else", () => {
    expect(() => normaliseWaveform({ color: "red; rm -rf /" })).toThrow(MediaError);
    expect(() => normaliseWaveform({ color: "" })).toThrow(MediaError);
    expect(() => normaliseWaveform({ color: "#gggggg" })).toThrow(MediaError);
  });
});

describe("buildWaveformArgs", () => {
  it("draws a single frame with showwavespic into the output path", () => {
    const args = buildWaveformArgs({ inputPath: "/media/in.mp4", outputPath: "/cache/wf.png" });

    expect(args[0]).toBe("-y");
    expect(args).toContain("/media/in.mp4");
    expect(args).toContain("showwavespic=s=1200x120:colors=white");
    expect(args).toContain("-frames:v");
    expect(args.at(-1)).toBe("/cache/wf.png");
    expect(args.every((arg) => typeof arg === "string")).toBe(true);
  });

  it("uses the requested size and colour", () => {
    const args = buildWaveformArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/cache/wf.png",
      options: { width: 320, height: 64, color: "#00ff00" },
    });

    expect(args).toContain("showwavespic=s=320x64:colors=#00ff00");
  });

  it("rejects a bad colour before any process runs", () => {
    expect(() =>
      buildWaveformArgs({
        inputPath: "/media/in.mp4",
        outputPath: "/cache/wf.png",
        options: { color: "nope;bad" },
      }),
    ).toThrow(MediaError);
  });
});

describe("buildFlatWaveformArgs", () => {
  it("draws a flat line for a source with no audio", () => {
    const args = buildFlatWaveformArgs({ outputPath: "/cache/flat.png" });

    expect(args).toContain("lavfi");
    expect(args.join(" ")).toContain("drawbox");
    expect(args).toContain("/cache/flat.png");
    expect(args).toContain("rgba");
  });
});
