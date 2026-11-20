import { describe, expect, it } from "vitest";
import { parseProbeOutput, probeMedia, ProbeError } from "./probe";
import type { CommandRunner } from "./exec";

const VIDEO_AUDIO = JSON.stringify({
  streams: [
    {
      index: 0,
      codec_name: "h264",
      codec_type: "video",
      width: 1920,
      height: 1080,
      r_frame_rate: "30000/1001",
      side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
    },
    {
      index: 1,
      codec_name: "aac",
      codec_type: "audio",
      channels: 2,
      sample_rate: "48000",
    },
  ],
  format: {
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    duration: "12.345000",
    size: "1234567",
  },
});

const AUDIO_ONLY = JSON.stringify({
  streams: [{ index: 0, codec_name: "mp3", codec_type: "audio", channels: 1, sample_rate: "44100" }],
  format: { format_name: "mp3", duration: "61.5" },
});

const ODD_FRAME_RATE = JSON.stringify({
  streams: [
    { index: 0, codec_name: "vp9", codec_type: "video", width: 1280, height: 720, r_frame_rate: "24000/1001" },
  ],
  format: { format_name: "webm", duration: "3.0" },
});

const ROTATED_VIA_TAGS = JSON.stringify({
  streams: [
    {
      index: 0,
      codec_name: "hevc",
      codec_type: "video",
      width: 1920,
      height: 1080,
      r_frame_rate: "30/1",
      tags: { rotate: "90" },
    },
  ],
  format: { format_name: "mov", duration: "5.0" },
});

describe("parseProbeOutput", () => {
  it("parses a video with audio", () => {
    const info = parseProbeOutput(VIDEO_AUDIO);

    expect(info.durationSeconds).toBeCloseTo(12.345, 3);
    expect(info.formatName).toContain("mp4");
    expect(info.sizeBytes).toBe(1234567);
    expect(info.streams).toHaveLength(2);
    expect(info.streams[0]).toMatchObject({
      index: 0,
      kind: "video",
      codec: "h264",
      width: 1920,
      height: 1080,
      rotation: -90,
    });
    expect(info.streams[0]?.frameRate).toBeCloseTo(29.97, 2);
    expect(info.streams[1]).toMatchObject({
      index: 1,
      kind: "audio",
      codec: "aac",
      channels: 2,
      sampleRate: 48000,
    });
  });

  it("parses an audio-only file", () => {
    const info = parseProbeOutput(AUDIO_ONLY);

    expect(info.streams).toHaveLength(1);
    expect(info.streams[0]).toMatchObject({ kind: "audio", codec: "mp3", channels: 1 });
  });

  it("handles a non-integer frame rate", () => {
    const info = parseProbeOutput(ODD_FRAME_RATE);

    expect(info.streams[0]?.frameRate).toBeCloseTo(23.976, 2);
  });

  it("reads rotation from tags when side data is absent", () => {
    const info = parseProbeOutput(ROTATED_VIA_TAGS);

    expect(info.streams[0]?.rotation).toBe(90);
  });

  it("reports a missing duration as null", () => {
    const info = parseProbeOutput(JSON.stringify({ streams: [], format: { format_name: "image2" } }));

    expect(info.durationSeconds).toBeNull();
    expect(info.sizeBytes).toBeNull();
    expect(info.streams).toEqual([]);
  });

  it("rejects invalid JSON with a ProbeError", () => {
    expect(() => parseProbeOutput("{oops")).toThrow(ProbeError);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => parseProbeOutput("[]")).toThrow(ProbeError);
  });
});

describe("probeMedia", () => {
  it("runs ffprobe with an argv array and the file as the last argument", async () => {
    const calls: { file: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (file, args) => {
      calls.push({ file, args });
      return { stdout: VIDEO_AUDIO, stderr: "" };
    };

    await probeMedia(runner, "/media/take.mp4");

    expect(calls[0]?.file).toBe("ffprobe");
    expect(calls[0]?.args).toContain("-show_streams");
    expect(calls[0]?.args).toContain("-print_format");
    expect(calls[0]?.args.at(-1)).toBe("/media/take.mp4");
  });

  it("surfaces the stderr excerpt when ffprobe fails", async () => {
    const runner: CommandRunner = async () => {
      throw Object.assign(new Error("Command failed: ffprobe"), {
        stderr: "No such file or directory",
      });
    };

    await expect(probeMedia(runner, "/missing.mp4")).rejects.toThrow(/No such file or directory/);
  });
});
