import { describe, expect, it } from "vitest";
import {
  buildChunkArgs,
  buildExtractArgs,
  buildProbeArgs,
  chunkLengthSeconds,
  EXTRACT_BITRATE_KBPS,
  planChunks,
  probeDurationSeconds,
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

describe("buildProbeArgs", () => {
  it("prints only the format duration as a bare number", () => {
    expect(buildProbeArgs("/tmp/take.mp3")).toEqual([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      "/tmp/take.mp3",
    ]);
  });
});

describe("probeDurationSeconds", () => {
  it("parses the ffprobe stdout into seconds", async () => {
    const run: LocalRunner = async () => ({ stdout: "100.000000\n", stderr: "" });

    await expect(probeDurationSeconds(run, "/tmp/take.mp3")).resolves.toBe(100);
  });

  it("maps a missing binary to not-configured", async () => {
    const missing = Object.assign(new Error("spawn ffprobe ENOENT"), { code: "ENOENT" });
    const run: LocalRunner = async () => Promise.reject(missing);

    await expect(probeDurationSeconds(run, "/tmp/take.mp3"))
      .rejects.toMatchObject({ code: "not-configured" });
  });

  it("maps a non-numeric duration to request-failed", async () => {
    const run: LocalRunner = async () => ({ stdout: "N/A\n", stderr: "" });

    await expect(probeDurationSeconds(run, "/tmp/take.mp3"))
      .rejects.toMatchObject({ code: "request-failed" });
  });

  it("maps an abort to a cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const run: LocalRunner = async () => Promise.reject(new Error("killed"));

    await expect(
      probeDurationSeconds(run, "/tmp/take.mp3", { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "request-failed", message: "transcription cancelled" });
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

describe("planChunks", () => {
  it("returns a single chunk when the audio fits one chunk", () => {
    expect(planChunks(5, 40000, EXTRACT_BITRATE_KBPS)).toEqual([
      { startSeconds: 0, durationSeconds: 5 },
    ]);
  });

  it("plans chunks from the duration so each stays under the limit", () => {
    const segments = planChunks(100, 40000, EXTRACT_BITRATE_KBPS);

    const bytesPerSecond = (EXTRACT_BITRATE_KBPS * 1000) / 8;
    expect(segments).toHaveLength(12);
    expect(segments[0]?.startSeconds).toBe(0);
    expect(segments[segments.length - 1]?.startSeconds).toBe(99);
    for (const segment of segments) {
      expect(segment.durationSeconds * bytesPerSecond).toBeLessThanOrEqual(40000 * 0.9);
    }
  });
});

describe("chunkLengthSeconds", () => {
  it("keeps each chunk under the limit", () => {
    const maxUploadBytes = 4000;
    const bytesPerSecond = (EXTRACT_BITRATE_KBPS * 1000) / 8;
    const length = chunkLengthSeconds(maxUploadBytes, EXTRACT_BITRATE_KBPS);

    expect(length * bytesPerSecond).toBeLessThanOrEqual(maxUploadBytes);
  });
});
