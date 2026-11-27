import { describe, expect, it } from "vitest";
import { buildExportArgs } from "./export";
import { DEFAULT_PRESET_ID, EXPORT_PRESETS, resolvePreset, withPresetExtension } from "./presets";

describe("EXPORT_PRESETS", () => {
  it("offers the bundles the product promises", () => {
    expect(EXPORT_PRESETS.map((preset) => preset.id)).toEqual([
      "web-h264",
      "webm-vp9",
      "archive-h264",
      "podcast-audio",
    ]);
  });

  it("gives every preset a label, an extension, and an audio codec", () => {
    for (const preset of EXPORT_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.extension).toMatch(/^[a-z0-9]+$/);
      expect((preset.codecs.audioCodec ?? "").trim()).not.toBe("");
    }
  });

  it("gives every video preset a video codec and keeps podcast-audio audio-only", () => {
    for (const preset of EXPORT_PRESETS) {
      if (preset.id === "podcast-audio") {
        expect(preset.codecs.videoCodec).toBeUndefined();
      } else {
        expect((preset.codecs.videoCodec ?? "").trim()).not.toBe("");
      }
    }
  });

  it("keeps ids unique", () => {
    const ids = EXPORT_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolvePreset", () => {
  it("returns the requested preset", () => {
    expect(resolvePreset("webm-vp9").id).toBe("webm-vp9");
  });

  it("falls back to the default for unknown or missing ids", () => {
    expect(resolvePreset(undefined).id).toBe(DEFAULT_PRESET_ID);
    expect(resolvePreset("").id).toBe(DEFAULT_PRESET_ID);
    expect(resolvePreset("nope").id).toBe(DEFAULT_PRESET_ID);
  });

  it("matches ids regardless of case and surrounding space", () => {
    expect(resolvePreset("  WEBM-VP9 ").id).toBe("webm-vp9");
  });
});

describe("withPresetExtension", () => {
  it("appends the extension when the path lacks one", () => {
    expect(withPresetExtension("/out/take", resolvePreset("webm-vp9"))).toBe("/out/take.webm");
  });

  it("leaves a path that already ends with the preset extension", () => {
    expect(withPresetExtension("/out/take.webm", resolvePreset("webm-vp9"))).toBe("/out/take.webm");
  });

  it("replaces a different extension", () => {
    expect(withPresetExtension("/out/take.mp4", resolvePreset("webm-vp9"))).toBe("/out/take.webm");
  });

  it("is case-insensitive about the existing extension", () => {
    expect(withPresetExtension("/out/take.WEBM", resolvePreset("webm-vp9"))).toBe("/out/take.webm");
  });
});

describe("preset wiring", () => {
  it("carries each preset's codecs into FFmpeg's argv", () => {
    for (const preset of EXPORT_PRESETS) {
      const args = buildExportArgs({
        inputPath: "/media/in.mp4",
        outputPath: withPresetExtension("/out/take", preset),
        kept: [{ start: 0, end: 1 }],
        hasAudio: true,
        codecs: preset.codecs,
      });

      expect(args).toContain(preset.codecs.audioCodec);
      expect(args.join(" ")).toContain(withPresetExtension("/out/take", preset));

      if (preset.codecs.videoCodec === undefined) {
        expect(args).not.toContain("-c:v");
      } else {
        expect(args).toContain("-c:v");
        expect(args).toContain(preset.codecs.videoCodec);
      }
    }
  });

  it("builds no video filter, map, or codec for the audio-only podcast preset", () => {
    const preset = resolvePreset("podcast-audio");

    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/out/take.m4a",
      items: [
        { kind: "video", startSeconds: 0, endSeconds: 1 },
        { kind: "silence", durationSeconds: 1.5 },
        { kind: "video", startSeconds: 1.5, endSeconds: 3 },
      ],
      hasAudio: true,
      codecs: preset.codecs,
    });

    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(preset.codecs.videoCodec).toBeUndefined();
    expect(filter).toContain("[0:a]atrim=start=0.000000:end=1.000000");
    expect(filter).toContain("anullsrc=r=48000:cl=stereo:d=1.500000");
    expect(filter).toContain("concat=n=3:v=0:a=1[aout]");
    expect(filter).not.toContain("[0:v]");
    expect(filter).not.toContain("[vout]");
    expect(filter).not.toContain("color=c=black");
    expect(args).not.toContain("[vout]");
    expect(args).not.toContain("-c:v");
    expect(args).toContain("[aout]");
    expect(args).toContain("-c:a");
  });

  it("keeps the argv of a video preset unchanged", () => {
    const args = buildExportArgs({
      inputPath: "/media/in.mp4",
      outputPath: "/out/take.mp4",
      kept: [{ start: 0, end: 1 }],
      hasAudio: true,
      codecs: resolvePreset("web-h264").codecs,
    });

    expect(args).toEqual([
      "-y",
      "-i",
      "/media/in.mp4",
      "-filter_complex",
      "[0:v]trim=start=0.000000:end=1.000000,setpts=PTS-STARTPTS[v0];[0:a]atrim=start=0.000000:end=1.000000,asetpts=PTS-STARTPTS[a0];[v0][a0]concat=n=1:v=1:a=1[vout][aout]",
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-progress",
      "pipe:1",
      "-nostats",
      "/out/take.mp4",
    ]);
  });
});
