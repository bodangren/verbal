import { describe, expect, it } from "vitest";
import {
  buildChunkArgs,
  buildExtractArgs,
  chunkLengthSeconds,
  chunkStartsSeconds,
  EXTRACT_BITRATE_KBPS,
  runExtract,
} from "./audio-extract";
import type { LocalRunner } from "./process";

describe("buildExtractArgs", () => {
  it("extracts mono 16 kHz MP3 audio without the video stream", () => {
    expect(buildExtractArgs("/media/take.mp4", "/tmp/take.mp3")).toEqual([
      "-v",
      "error",
      "-y",
      "-i",
      "/media/take.mp4",
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "32k",
      "/tmp/take.mp3",
    ]);
  });
});

describe("buildChunkArgs", () => {
  it("cuts one time slice with -ss and -t before the input", () => {
    expect(buildChunkArgs("/tmp/take.mp3", "/tmp/chunk.mp3", 12.5, 30)).toEqual([
      "-v",
      "error",
      "-y",
      "-ss",
      "12.500",
      "-t",
      "30.000",
      "-i",
      "/tmp/take.mp3",
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "32k",
      "/tmp/chunk.mp3",
    ]);
  });
});

describe("runExtract", () => {
  it("maps a missing binary to not-configured", async () => {
    const missing = Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    const run: LocalRunner = async () => Promise.reject(missing);

    await expect(runExtract(run, ["-i", "in.mp4"]))
      .rejects.toMatchObject({ code: "not-configured" });
  });

  it("maps an abort to a cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const run: LocalRunner = async () => Promise.reject(new Error("killed"));

    await expect(
      runExtract(run, ["-i", "in.mp4"], { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "request-failed", message: "transcription cancelled" });
  });

  it("maps any other failure to request-failed", async () => {
    const run: LocalRunner = async () => Promise.reject(new Error("bad input"));

    await expect(runExtract(run, ["-i", "in.mp4"])).rejects.toMatchObject({
      code: "request-failed",
      message: "bad input",
    });
  });

  it("resolves when the extraction succeeds", async () => {
    const run: LocalRunner = async () => ({ stdout: "", stderr: "" });

    await expect(runExtract(run, ["-i", "in.mp4"])).resolves.toBeUndefined();
  });
});

describe("chunkStartsSeconds", () => {
  it("returns a single chunk when the audio fits the limit", () => {
    expect(chunkStartsSeconds(100, 4000, EXTRACT_BITRATE_KBPS)).toEqual([0]);
    expect(chunkStartsSeconds(4000, 4000, EXTRACT_BITRATE_KBPS)).toEqual([0]);
  });

  it("splits a file over the limit into equal offsets", () => {
    const starts = chunkStartsSeconds(8000, 4000, EXTRACT_BITRATE_KBPS);

    expect(starts).toEqual([0, 1]);
  });

  it("keeps each chunk under the limit", () => {
    const maxUploadBytes = 4000;
    const bytesPerSecond = (EXTRACT_BITRATE_KBPS * 1000) / 8;
    const length = chunkLengthSeconds(maxUploadBytes, EXTRACT_BITRATE_KBPS);

    expect(length * bytesPerSecond).toBeLessThanOrEqual(maxUploadBytes);
  });
});
