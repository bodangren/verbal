import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeMedia, runCommand } from "@verbal/media";
import { buildVideoRangeArgs } from "./video-range";

function hasBinary(name: string): boolean {
  try {
    execFileSync(name, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const ffmpegAvailable = hasBinary("ffmpeg") && hasBinary("ffprobe");

describe.skipIf(!ffmpegAvailable)("video range integration", () => {
  let directory = "";
  let source = "";
  let output = "";

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "verbal-video-range-"));
    source = path.join(directory, "video-only.mp4");
    output = path.join(directory, "talk-cut.mp4");

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x120:rate=25:duration=3",
      "-c:v",
      "libx264",
      source,
    ]);
  });

  afterAll(async () => {
    if (directory !== "") {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("cuts a silent-source talk range into one video and one audio stream", async () => {
    const args = buildVideoRangeArgs({
      input: source,
      startSeconds: 0.5,
      durationSeconds: 1.5,
      outputPath: output,
      width: 160,
      height: 120,
      fps: 25,
      hasAudio: false,
    });

    await runCommand("ffmpeg", args);

    const info = await probeMedia(runCommand, output);
    const video = info.streams.filter((stream) => stream.kind === "video");
    const audio = info.streams.filter((stream) => stream.kind === "audio");

    expect(video).toHaveLength(1);
    expect(audio).toHaveLength(1);
    expect(info.durationSeconds).not.toBeNull();
    expect(Math.abs((info.durationSeconds ?? 0) - 1.5)).toBeLessThan(0.1);
  });
});
