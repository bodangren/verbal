// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createLocalWhisperProvider } from "@verbal/ai";
import { resolveSystemAsr } from "./transcribe-service";

const run = promisify(execFile);
const CLIP =
  "/home/daniebo/.cache/p6-base/apps/www-reading-advantage/public/videos/day17-coding-for-non-coders-th.mp4";

describe.skipIf(process.env.VERBAL_REAL_ASR !== "1")("real local ASR", () => {
  it("transcribes a clip with the installed whisper binary and model", async () => {
    const resolved = resolveSystemAsr();
    expect(resolved).toMatchObject({ mode: "local" });
    if (resolved.mode !== "local") {
      return;
    }

    const temp = await mkdtemp(path.join(tmpdir(), "verbal-asr-real-"));
    try {
      const clip = path.join(temp, "clip.mp4");
      await run("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-ss",
        "25",
        "-t",
        "20",
        "-i",
        CLIP,
        "-c",
        "copy",
        clip,
      ]);

      const provider = createLocalWhisperProvider({
        binary: resolved.binary,
        modelPath: resolved.modelPath,
        language: resolved.language,
      });
      const progressValues: number[] = [];
      const result = await provider.transcribe(
        { filePath: clip },
        { onProgress: (fraction) => progressValues.push(fraction) },
      );

      expect(new Set(progressValues).size).toBeGreaterThanOrEqual(3);
      expect(progressValues).toEqual([...progressValues].sort((left, right) => left - right));
      expect(result.words.length).toBeGreaterThan(10);
      for (const word of result.words) {
        expect(word.end).toBeGreaterThan(word.start);
      }

      console.log(
        `REAL_ASR progress=${progressValues.map((value) => value.toFixed(2)).join(",")}`,
      );
      console.log(`REAL_ASR words=${result.words.length}`);
      console.log(
        result.words
          .slice(0, 5)
          .map((word) => `${word.text} [${word.start.toFixed(2)}-${word.end.toFixed(2)}]`)
          .join(" | "),
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 180_000);
});
