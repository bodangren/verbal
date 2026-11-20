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

  it("gives every preset a label, an extension, and complete codecs", () => {
    for (const preset of EXPORT_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.extension).toMatch(/^[a-z0-9]+$/);
      expect(preset.codecs.videoCodec.trim()).not.toBe("");
      expect(preset.codecs.audioCodec.trim()).not.toBe("");
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

      expect(args).toContain(preset.codecs.videoCodec);
      expect(args).toContain(preset.codecs.audioCodec);
      expect(args.join(" ")).toContain(withPresetExtension("/out/take", preset));
    }
  });
});
