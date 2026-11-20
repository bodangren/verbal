import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeMedia, runCommand } from "@verbal/media";
import { buildConcatArgs, buildConcatListContent } from "./assemble";

function hasBinary(name: string): boolean {
  try {
    execFileSync(name, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const ffmpegAvailable = hasBinary("ffmpeg") && hasBinary("ffprobe");

describe.skipIf(!ffmpegAvailable)("assembly integration", () => {
  let directory = "";
  let first = "";
  let second = "";
  let output = "";

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "verbal-assembly-"));
    first = path.join(directory, "first.mp4");
    second = path.join(directory, "second.mp4");
    output = path.join(directory, "assembled.mp4");

    for (const [file, duration] of [
      [first, "1"],
      [second, "1"],
    ] as const) {
      await runCommand("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=size=160x120:rate=10:duration=${duration}`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=440:duration=${duration}`,
        "-c:v",
        "mpeg4",
        "-q:v",
        "5",
        "-c:a",
        "aac",
        "-shortest",
        file,
      ]);
    }
  }, 60_000);

  afterAll(async () => {
    if (directory !== "") {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("concatenates scene files into one output", async () => {
    const listPath = path.join(directory, "list.txt");
    await writeFile(listPath, buildConcatListContent([first, second]));

    await runCommand("ffmpeg", buildConcatArgs(listPath, output));

    const info = await probeMedia(runCommand, output);

    expect(info.durationSeconds).not.toBeNull();
    expect(info.durationSeconds ?? 0).toBeCloseTo(2, 0);
    expect(info.streams.some((stream) => stream.kind === "video")).toBe(true);
    expect(info.streams.some((stream) => stream.kind === "audio")).toBe(true);
  }, 60_000);
});
