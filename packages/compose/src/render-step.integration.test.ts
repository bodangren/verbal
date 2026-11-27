import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeFileSystem } from "@verbal/core";
import { probeMedia, runCommand } from "@verbal/media";
import { assembleStoryboard, buildConcatArgs, buildConcatListContent, planAssembly } from "./assemble";
import { audioFromBrand, type BrandKit } from "./brand";
import { createFileSlideCache } from "./cache";
import { createStepRenderer } from "./render-step";
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
  "storyboard end to end",
  () => {
    let directory = "";
    let speaker = "";
    let output = "";

    beforeAll(async () => {
      directory = await mkdtemp(path.join(tmpdir(), "verbal-storyboard-"));
      speaker = path.join(directory, "speaker.mp4");
      output = path.join(directory, "storyboard.mp4");

      await runCommand("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x00FF00:s=320x180:d=3:r=10",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x3366FF:s=80x120:d=3:r=10",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
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

    it("renders a title, a scene, and an outro into one file", async () => {
      const brand: BrandKit = {
        title: { text: "Verbal" },
        outro: { text: "Thanks for watching" },
        contact: { name: "Daniel" },
        lowerThird: { name: "Daniel" },
        loudnessLufs: -16,
      };

      const plan = planAssembly({
        scenes: [{ sceneId: "s1", startSeconds: 0, endSeconds: 1 }],
        brand,
        titleDurationSeconds: 1,
        outroDurationSeconds: 1,
      });

      const renderer = createProcessRenderer({
        command: process.execPath,
        args: [rendererPath],
        run: nodeProcessRunner,
        timeoutMs: 180_000,
      });

      const renderStep = createStepRenderer({
        renderer,
        cache: createFileSlideCache(nodeFileSystem, path.join(directory, "cache")),
        run: runCommand,
        workDirectory: directory,
        geometry: { fps: 10, width: 320, height: 180 },
        speaker: { input: speaker },
        audio: audioFromBrand(brand),
        scenes: new Map([
          [
            "s1",
            {
              template: "bullets",
              props: { title: "Points", bullets: ["One", "Two"] },
            },
          ],
        ]),
        codecs: { videoCodec: "mpeg4", videoArgs: ["-q:v", "5"] },
      });

      const assembled = await assembleStoryboard(
        {
          renderStep,
          concat: async (files, target) => {
            const listPath = path.join(directory, "list.txt");
            await writeFile(listPath, buildConcatListContent(files));
            await runCommand("ffmpeg", buildConcatArgs(listPath, target));
          },
        },
        plan,
        output,
      );

      expect(assembled.files).toHaveLength(3);

      const info = await probeMedia(runCommand, output);

      expect(info.durationSeconds).not.toBeNull();
      expect(info.durationSeconds ?? 0).toBeCloseTo(3, 0);
      expect(info.streams.some((stream) => stream.kind === "video")).toBe(true);
      expect(info.streams.some((stream) => stream.kind === "audio")).toBe(true);
    }, 180_000);
  },
);

/** Reads the `mean_volume` line that `volumedetect` prints to stderr. */
function meanVolumeDb(stderr: string): number {
  const match = stderr.match(/mean_volume:\s*(-inf|-?\d+(?:\.\d+)?)\s*dB/);
  if (match === null || match[1] === undefined) {
    throw new Error("volumedetect reported no mean_volume");
  }
  return match[1] === "-inf" ? -100 : Number(match[1]);
}

describe.skipIf(!hasBinary("ffmpeg"))("slide scene seeks the speaker", () => {
  let directory = "";
  let slide = "";
  let speaker = "";

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "verbal-slide-seek-"));
    slide = path.join(directory, "slide.png");
    speaker = path.join(directory, "speaker.mp4");

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

    // The speaker plays 440 Hz for 30 s, then 880 Hz for 5 s.
    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x00FF00:s=320x180:d=35:r=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=5",
      "-filter_complex",
      "[1:a][2:a]concat=n=2:v=0:a=1[a]",
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "mpeg4",
      "-q:v",
      "5",
      "-c:a",
      "aac",
      "-shortest",
      speaker,
    ]);
  }, 120_000);

  afterAll(async () => {
    if (directory !== "") {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("plays the 30 s tone under a slide anchored at 30 s", async () => {
    const plan = planAssembly({
      scenes: [{ sceneId: "slide30", startSeconds: 30, endSeconds: 32 }],
      brand: {
        title: { text: "" },
        outro: { text: "" },
        contact: { name: "" },
        lowerThird: { name: "" },
        loudnessLufs: -16,
      },
      includeBrand: false,
    });

    const step = plan[0];
    if (step === undefined) {
      throw new Error("the plan holds one scene");
    }

    const render = createStepRenderer({
      renderer: {
        render: async () => {
          throw new Error("asset scenes must not render a slide");
        },
      },
      cache: createFileSlideCache(nodeFileSystem, path.join(directory, "cache")),
      run: runCommand,
      workDirectory: directory,
      geometry: { fps: 10, width: 320, height: 180 },
      speaker: { input: speaker },
      audio: { loudnessLufs: -16 },
      scenes: new Map([["slide30", { assetPath: slide }]]),
      codecs: { videoCodec: "mpeg4", videoArgs: ["-q:v", "5"] },
    });

    const file = await render(step, 0);
    expect(file).toBe(path.join(directory, "step-000.mp4"));

    const info = await probeMedia(runCommand, file);
    expect(info.durationSeconds ?? 0).toBeCloseTo(2, 0);

    // 880 Hz survives a 600 Hz highpass and dies in a 600 Hz lowpass;
    // 440 Hz does the opposite. The segment must look like 880 Hz.
    const high = await runCommand("ffmpeg", [
      "-hide_banner",
      "-i",
      file,
      "-af",
      "highpass=f=600,volumedetect",
      "-f",
      "null",
      "-",
    ]);
    const low = await runCommand("ffmpeg", [
      "-hide_banner",
      "-i",
      file,
      "-af",
      "lowpass=f=600,volumedetect",
      "-f",
      "null",
      "-",
    ]);

    expect(meanVolumeDb(high.stderr)).toBeGreaterThan(meanVolumeDb(low.stderr) + 6);
  }, 180_000);
});
