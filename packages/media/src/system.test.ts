import { describe, expect, it } from "vitest";
import type { CommandRunner } from "./exec";
import { checkTools, describeMissingTools } from "./system";

/** Builds a runner that answers only for the binaries in `versions`. */
function fakeRunner(versions: Record<string, string>): CommandRunner {
  return async (file) => {
    const version = versions[file];
    if (version === undefined) {
      throw new Error(`${file}: not found`);
    }
    return { stdout: `${version}\nconfiguration: fake`, stderr: "" };
  };
}

describe("checkTools", () => {
  it("reports both tools with the first line of their version output", async () => {
    const status = await checkTools(
      fakeRunner({ ffmpeg: "ffmpeg version 7.1", ffprobe: "ffprobe version 7.1" }),
    );

    expect(status.ffmpeg).toEqual({ available: true, version: "ffmpeg version 7.1" });
    expect(status.ffprobe).toEqual({ available: true, version: "ffprobe version 7.1" });
  });

  it("reports a missing tool instead of throwing", async () => {
    const status = await checkTools(fakeRunner({ ffmpeg: "ffmpeg version 7.1" }));

    expect(status.ffmpeg.available).toBe(true);
    expect(status.ffprobe.available).toBe(false);
    expect(status.ffprobe.error).toContain("ffprobe");
  });

  it("treats empty version output as available without a version string", async () => {
    const status = await checkTools(async () => ({ stdout: "\n", stderr: "" }));

    expect(status.ffmpeg).toEqual({ available: true });
    expect(status.ffprobe).toEqual({ available: true });
  });
});

describe("describeMissingTools", () => {
  it("lists only the tools that are unavailable", () => {
    expect(
      describeMissingTools({
        ffmpeg: { available: true },
        ffprobe: { available: false, error: "missing" },
      }),
    ).toEqual(["ffprobe"]);
  });

  it("returns an empty list when everything is present", () => {
    expect(
      describeMissingTools({
        ffmpeg: { available: true },
        ffprobe: { available: true },
      }),
    ).toEqual([]);
  });
});
