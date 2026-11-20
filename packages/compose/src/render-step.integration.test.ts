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
