import { describe, expect, it } from "vitest";
import { buildVideoRangeArgs, VideoRangeError } from "./video-range";

describe("buildVideoRangeArgs", () => {
  it("seeks the source, bounds the output, and matches the export geometry", () => {
    const args = buildVideoRangeArgs({
      input: "/media/take.mp4",
      startSeconds: 7.5,
      durationSeconds: 4,
      outputPath: "/out/step-001.mp4",
      width: 1280,
      height: 720,
      fps: 30,
    });

    expect(args).toContain("-ss");
    expect(args[args.indexOf("-ss") + 1]).toBe("7.500");
    expect(args[args.indexOf("-t") + 1]).toBe("4.000");
    expect(args.join(" ")).toContain("scale=1280:720");
    expect(args).toContain("libx264");
    expect(args[args.indexOf("-r") + 1]).toBe("30");
    expect(args[args.indexOf("-ar") + 1]).toBe("48000");
    expect(args.at(-1)).toBe("/out/step-001.mp4");
  });

  it("uses caller-supplied codec args", () => {
    const args = buildVideoRangeArgs({
      input: "/media/take.mp4",
      startSeconds: 0,
      durationSeconds: 1,
      outputPath: "/out/one.mp4",
      width: 320,
      height: 180,
      fps: 10,
      videoArgs: ["-q:v", "4"],
      audioArgs: ["-b:a", "96k"],
    });

    expect(args).toContain("-q:v");
    expect(args).toContain("96k");
  });

  it("rejects a non-positive duration", () => {
    expect(() =>
      buildVideoRangeArgs({
        input: "/media/take.mp4",
        startSeconds: 0,
        durationSeconds: 0,
        outputPath: "/out/one.mp4",
        width: 320,
        height: 180,
        fps: 10,
      }),
    ).toThrow(VideoRangeError);
  });
});

describe("preset codecs", () => {
  it("uses the codec names the preset supplies", () => {
    const args = buildVideoRangeArgs({
      input: "/media/take.mp4",
      startSeconds: 0,
      durationSeconds: 1,
      outputPath: "/out/one.webm",
      width: 320,
      height: 180,
      fps: 10,
      videoCodec: "libvpx-vp9",
      audioCodec: "libopus",
    });

    expect(args).toContain("libvpx-vp9");
    expect(args).toContain("libopus");
  });
});
