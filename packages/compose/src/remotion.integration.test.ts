import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeMedia, runCommand } from "@verbal/media";
import { buildCompositeArgs } from "./composite";
import { createProcessRenderer, nodeProcessRunner } from "./worker";

function hasBinary(name: string): boolean {
  try {
    execFileSync(name, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const rendererPath = path.resolve("tools/remotion/render.mjs");
const enabled = process.env.VERBAL_REMOTION_TEST === "1";

describe.skipIf(!enabled || !existsSync(rendererPath) || !hasBinary("ffmpeg"))(
  "remotion end to end",
  () => {
    let directory = "";
    let output = "";
    let speaker = "";

    beforeAll(async () => {
      directory = await mkdtemp(path.join(tmpdir(), "verbal-remotion-"));
      output = path.join(directory, "composite.mp4");
      speaker = path.join(directory, "speaker.mp4");

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

    it("renders a Remotion slide and composites it over a speaker", async () => {
      const framesDirectory = path.join(directory, "frames");

      const renderer = createProcessRenderer({
        command: process.execPath,
        args: [rendererPath],
        run: nodeProcessRunner,
        timeoutMs: 180_000,
      });

      const manifest = await renderer.render(
        {
          sceneId: "s1",
          template: "title",
          props: { title: "End to end", subtitle: "Remotion → FFmpeg" },
          durationSeconds: 1,
          fps: 10,
          width: 320,
          height: 180,
        },
        { outputDirectory: framesDirectory },
      );

      expect(manifest.frames).toBe(10);
      expect(manifest.hasAlpha).toBe(true);

      const request = {
        outputPath: output,
        width: 320,
        height: 180,
        fps: 10,
        durationSeconds: 1,
        layout: "speaker-inset" as const,
        slide: {
          input: path.join(framesDirectory, manifest.pattern),
          frameRate: manifest.fps,
        },
        speaker: { input: speaker },
        key: {},
        audio: { loudnessLufs: -16 },
      };

      await runCommand("ffmpeg", buildCompositeArgs(request));

      const info = await probeMedia(runCommand, output);

      expect(info.durationSeconds ?? 0).toBeCloseTo(1, 0);
      expect(info.streams.some((stream) => stream.kind === "video")).toBe(true);
      expect(info.streams.some((stream) => stream.kind === "audio")).toBe(true);
    }, 180_000);
  },
);
