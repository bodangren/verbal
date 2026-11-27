import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTranscript, removeRange } from "@verbal/core";
import { buildCutList } from "./cutlist";
import { runExport } from "./export";
import { resolvePreset } from "./presets";
import { probeMedia } from "./probe";
import { runCommand } from "./exec";

function hasBinary(name: string): boolean {
  try {
    execFileSync(name, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const ffmpegAvailable = hasBinary("ffmpeg") && hasBinary("ffprobe");

describe.skipIf(!ffmpegAvailable)("export integration", () => {
  let directory = "";
  let fixture = "";
  let output = "";

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "verbal-export-"));
    fixture = path.join(directory, "fixture.mp4");
    output = path.join(directory, "cut.mp4");

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x120:rate=10:duration=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=10",
      "-c:v",
      "mpeg4",
      "-q:v",
      "5",
      "-c:a",
      "aac",
      "-shortest",
      fixture,
    ]);
  }, 60_000);

  afterAll(async () => {
    if (directory !== "") {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("exports the kept ranges and reports the expected duration", async () => {
    const transcript = createTranscript([
      { text: "keep", start: 0, end: 0.4 },
      { text: "drop", start: 0.45, end: 0.9 },
      { text: "keep", start: 1.8, end: 9.9 },
    ]);

    const cutList = buildCutList({
      transcript: removeRange(transcript, 1, 1),
      durationSeconds: 10,
      handleSeconds: 0.05,
    });

    const progress: number[] = [];

    await runExport({
      inputPath: fixture,
      outputPath: output,
      kept: cutList.kept,
      hasAudio: true,
      codecs: { videoCodec: "mpeg4", videoArgs: ["-q:v", "5"] },
      onProgress: (event) => progress.push(event.percent),
    });

    const info = await probeMedia(runCommand, output);

    expect(info.durationSeconds).not.toBeNull();
    expect(info.durationSeconds ?? 0).toBeCloseTo(cutList.keptDurationSeconds, 0);
    expect(info.streams.some((stream) => stream.kind === "video")).toBe(true);
    expect(info.streams.some((stream) => stream.kind === "audio")).toBe(true);
    expect(progress.at(-1)).toBe(1);
  }, 60_000);

  it("exports an audio-only preset as one audio stream with no video stream", async () => {
    const tone = path.join(directory, "tone.wav");
    const podcast = path.join(directory, "podcast.m4a");

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=4",
      tone,
    ]);

    await runExport({
      inputPath: tone,
      outputPath: podcast,
      items: [
        { kind: "video", startSeconds: 0, endSeconds: 1 },
        { kind: "video", startSeconds: 2, endSeconds: 3 },
      ],
      hasAudio: true,
      codecs: resolvePreset("podcast-audio").codecs,
    });

    const info = await probeMedia(runCommand, podcast);

    expect(info.streams).toHaveLength(1);
    expect(info.streams[0]?.kind).toBe("audio");
    expect(info.streams.some((stream) => stream.kind === "video")).toBe(false);
  }, 60_000);

  it("exports a rotated source with an inserted silence at the display size", async () => {
    const plain = path.join(directory, "rotated-source.mp4");
    const rotated = path.join(directory, "rotated.mp4");
    const rotatedOut = path.join(directory, "rotated-out.mp4");

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x120:rate=25:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=duration=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      plain,
    ]);

    await runCommand("ffmpeg", [
      "-y",
      "-display_rotation",
      "90",
      "-i",
      plain,
      "-map",
      "0",
      "-c",
      "copy",
      rotated,
    ]);

    const sourceInfo = await probeMedia(runCommand, rotated);
    const sourceVideo = sourceInfo.streams.find((stream) => stream.kind === "video");

    expect(sourceVideo?.width).toBe(160);
    expect(sourceVideo?.height).toBe(120);
    expect(sourceVideo?.displayWidth).toBe(120);
    expect(sourceVideo?.displayHeight).toBe(160);

    const geometry = {
      width: sourceVideo?.displayWidth ?? sourceVideo?.width ?? 0,
      height: sourceVideo?.displayHeight ?? sourceVideo?.height ?? 0,
      fps: sourceVideo?.frameRate ?? 25,
    };

    await runExport({
      inputPath: rotated,
      outputPath: rotatedOut,
      items: [
        { kind: "video", startSeconds: 0, endSeconds: 2 },
        { kind: "silence", durationSeconds: 1 },
      ],
      hasAudio: true,
      video: geometry,
    });

    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "stream=codec_type,width,height,duration",
      rotatedOut,
    ]);
    const streams = (JSON.parse(stdout).streams ?? []) as Array<{
      codec_type: string;
      width?: number;
      height?: number;
      duration?: string;
    }>;
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");

    expect(video).toBeDefined();
    expect(audio).toBeDefined();
    expect(video?.width).toBe(120);
    expect(video?.height).toBe(160);
    expect(Math.abs(Number(video?.duration ?? -1) - 3.0)).toBeLessThan(0.1);
    expect(Math.abs(Number(audio?.duration ?? -1) - 3.0)).toBeLessThan(0.1);
  }, 60_000);
});
