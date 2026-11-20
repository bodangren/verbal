import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createProject,
  createTranscript,
  nodeFileSystem,
  openProject,
  parseTranscript,
  projectPaths,
  removeRange,
  saveProject,
  saveTranscript,
} from "@verbal/core";
import {
  buildCutList,
  importMedia,
  nodeImportFileSystem,
  probeMedia,
  runCommand,
  runExport,
} from "@verbal/media";

function hasBinary(name: string): boolean {
  try {
    execFileSync(name, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const ffmpegAvailable = hasBinary("ffmpeg") && hasBinary("ffprobe");

describe.skipIf(!ffmpegAvailable)("end to end: import → transcript → cut → export", () => {
  let directory = "";
  let source = "";

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "verbal-e2e-"));
    source = path.join(directory, "source.mp4");

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x120:rate=10:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-c:v",
      "mpeg4",
      "-q:v",
      "5",
      "-c:a",
      "aac",
      "-shortest",
      source,
    ]);
  }, 60_000);

  afterAll(async () => {
    if (directory !== "") {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("creates a project, imports media, and exports the kept ranges", async () => {
    const projectRoot = path.join(directory, "project");

    await createProject(nodeFileSystem, projectRoot, { name: "E2E" });

    const imported = await importMedia(nodeImportFileSystem, {
      mode: "copy",
      sourcePath: source,
      projectRoot,
    });

    expect(imported.mode).toBe("copy");

    if (imported.mode !== "copy") {
      throw new Error("expected a copy import");
    }

    const project = await openProject(nodeFileSystem, projectRoot);
    await saveProject(nodeFileSystem, projectRoot, {
      ...project,
      media: { assetPath: imported.assetPath },
    });

    const saved = createTranscript([
      { text: "one", start: 0, end: 0.5 },
      { text: "drop", start: 0.6, end: 1 },
      { text: "two", start: 1.5, end: 3 },
    ]);
    await saveTranscript(nodeFileSystem, projectPaths(projectRoot).transcript, saved);

    const reread = parseTranscript(
      await nodeFileSystem.readFile(projectPaths(projectRoot).transcript),
    );
    const cutList = buildCutList({
      transcript: removeRange(reread, 1, 1),
      durationSeconds: 3,
      handleSeconds: 0.05,
    });

    const output = path.join(projectRoot, "exports", "cut.mp4");
    await runExport({
      inputPath: path.join(projectRoot, imported.assetPath),
      outputPath: output,
      kept: cutList.kept,
      hasAudio: true,
      codecs: { videoCodec: "mpeg4", videoArgs: ["-q:v", "5"] },
    });

    const info = await probeMedia(runCommand, output);

    expect(info.durationSeconds).not.toBeNull();
    expect(info.durationSeconds ?? 0).toBeCloseTo(cutList.keptDurationSeconds, 0);
    expect(info.streams.some((stream) => stream.kind === "audio")).toBe(true);
  }, 60_000);
});
