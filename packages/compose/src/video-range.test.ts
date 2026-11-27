import { describe, expect, it } from "vitest";
import { buildSilenceArgs, buildVideoRangeArgs, VideoRangeError } from "./video-range";

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

describe("buildVideoRangeArgs audio", () => {
  const base = {
    input: "/media/take.mp4",
    startSeconds: 0,
    durationSeconds: 1.5,
    outputPath: "/out/one.mp4",
    width: 320,
    height: 180,
    fps: 10,
  };

  it("keeps the existing argv when the source has audio", () => {
    const expected = [
      "-y",
      "-ss",
      "0.000",
      "-i",
      "/media/take.mp4",
      "-t",
      "1.500",
      "-vf",
      "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1",
      "-r",
      "10",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-progress",
      "pipe:1",
      "-nostats",
      "/out/one.mp4",
    ];

    expect(buildVideoRangeArgs({ ...base, hasAudio: true })).toEqual(expected);
    expect(buildVideoRangeArgs(base)).toEqual(expected);
  });

  it("adds a silent stereo input and maps it when the source has no audio", () => {
    const args = buildVideoRangeArgs({ ...base, hasAudio: false });

    const silentIndex = args.indexOf("anullsrc=r=48000:cl=mono");
    expect(silentIndex).toBeGreaterThan(args.indexOf("/media/take.mp4"));
    expect(args[silentIndex - 1]).toBe("-i");
    expect(args[silentIndex - 2]).toBe("lavfi");
    expect(args[silentIndex - 3]).toBe("-f");
    expect(args.indexOf("-t")).toBeGreaterThan(silentIndex);
    expect(args[args.indexOf("-t") + 1]).toBe("1.500");

    const mapIndex = args.indexOf("1:a:0");
    expect(args[mapIndex - 1]).toBe("-map");
    expect(args[args.indexOf("0:v:0") - 1]).toBe("-map");
    expect(args.at(-1)).toBe("/out/one.mp4");
  });
});

describe("buildSilenceArgs", () => {
  it("makes a black frame with silent audio at the export geometry", () => {
    const args = buildSilenceArgs({
      durationSeconds: 1.5,
      outputPath: "/out/step-002.mp4",
      width: 320,
      height: 180,
      fps: 10,
    });

    const joined = args.join(" ");
    expect(joined).toContain("color=c=black:s=320x180");
    expect(joined).toContain("anullsrc=r=48000:cl=mono");
    expect(args[args.indexOf("-t") + 1]).toBe("1.500");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args.at(-1)).toBe("/out/step-002.mp4");
  });

  it("rejects a non-positive duration", () => {
    expect(() =>
      buildSilenceArgs({
        durationSeconds: 0,
        outputPath: "/out/step.mp4",
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
