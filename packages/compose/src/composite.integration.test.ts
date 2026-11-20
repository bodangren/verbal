import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeMedia, runCommand } from "@verbal/media";
import { buildCompositeArgs, type CompositeRequest } from "./composite";

function hasBinary(name: string): boolean {
  try {
    execFileSync(name, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const ffmpegAvailable = hasBinary("ffmpeg") && hasBinary("ffprobe");

describe.skipIf(!ffmpegAvailable)("composite integration", () => {
  let directory = "";
  let slide = "";
  let speaker = "";
  let output = "";

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "verbal-composite-"));
    slide = path.join(directory, "slide.png");
    speaker = path.join(directory, "speaker.mp4");
    output = path.join(directory, "composite.mp4");

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x101014:s=320x180",
      "-frames:v",
      "1",
      slide,
    ]);

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x00FF00:s=320x180:d=1:r=10",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x3366FF:s=80x120:d=1:r=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-filter_complex",
      "[0:v][1:v]overlay=120:30[v]",
      "-map",
      "[v]",
      "-map",
      "2:a",
      "-c:v",
      "mpeg4",
      "-q:v",
      "5",
      "-c:a",
      "aac",
      "-shortest",
      speaker,
    ]);
  }, 60_000);

  afterAll(async () => {
    if (directory !== "") {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("composites a keyed speaker over a slide", async () => {
    const request: CompositeRequest = {
      outputPath: output,
      width: 320,
      height: 180,
      fps: 10,
      durationSeconds: 1,
      layout: "speaker-inset",
      slide: { input: slide, loop: true },
      speaker: { input: speaker },
      key: {},
      audio: { loudnessLufs: -16 },
    };

    await runCommand("ffmpeg", buildCompositeArgs(request));

    const info = await probeMedia(runCommand, output);

    expect(info.durationSeconds).not.toBeNull();
    expect(info.durationSeconds ?? 0).toBeCloseTo(1, 0);
    expect(info.streams.some((stream) => stream.kind === "video")).toBe(true);
    expect(info.streams.some((stream) => stream.kind === "audio")).toBe(true);
  }, 60_000);
});
