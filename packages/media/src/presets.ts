import type { ExportCodecOptions } from "./export";

/** Stable ids: a stored choice must survive reordering the list. */
export type ExportPresetId = "web-h264" | "webm-vp9" | "archive-h264" | "podcast-audio";

export type ExportPreset = {
  id: ExportPresetId;
  label: string;
  /** Container extension without the dot. */
  extension: string;
  codecs: ExportCodecOptions;
};

const WEB: ExportPreset = {
  id: "web-h264",
  label: "Web (H.264)",
  extension: "mp4",
  codecs: {
    videoCodec: "libx264",
    audioCodec: "aac",
    videoArgs: ["-crf", "20", "-preset", "veryfast"],
    audioArgs: ["-b:a", "192k"],
  },
};

const WEBM: ExportPreset = {
  id: "webm-vp9",
  label: "WebM (VP9)",
  extension: "webm",
  codecs: {
    videoCodec: "libvpx-vp9",
    audioCodec: "libopus",
    videoArgs: ["-b:v", "0", "-crf", "32"],
    audioArgs: ["-b:a", "128k"],
  },
};

const ARCHIVE: ExportPreset = {
  id: "archive-h264",
  label: "Archive (H.264, high quality)",
  extension: "mp4",
  codecs: {
    videoCodec: "libx264",
    audioCodec: "aac",
    videoArgs: ["-crf", "16", "-preset", "medium"],
    audioArgs: ["-b:a", "320k"],
  },
};

const PODCAST: ExportPreset = {
  id: "podcast-audio",
  label: "Podcast (audio)",
  extension: "m4a",
  codecs: {
    audioCodec: "aac",
    audioArgs: ["-b:a", "128k"],
  },
};

/** Every bundle the export UI offers, in display order. */
export const EXPORT_PRESETS: readonly ExportPreset[] = [WEB, WEBM, ARCHIVE, PODCAST];

/** What an unset or unknown choice resolves to. */
export const DEFAULT_PRESET: ExportPreset = WEB;

export const DEFAULT_PRESET_ID: ExportPresetId = DEFAULT_PRESET.id;

/**
 * The requested preset, or the default.
 *
 * Ids are matched case- and space-insensitively, and an unknown id is not an
 * error: a stale stored choice should still export something sensible.
 */
export function resolvePreset(id: string | undefined): ExportPreset {
  const wanted = (id ?? "").trim().toLowerCase();
  return EXPORT_PRESETS.find((preset) => preset.id === wanted) ?? DEFAULT_PRESET;
}

/**
 * Forces the path to carry the preset's container extension.
 *
 * FFmpeg picks its muxer from the extension, so a WebM preset writing to
 * `take.mp4` would produce a file no player understands.
 */
export function withPresetExtension(outputPath: string, preset: ExportPreset): string {
  const directoryEnd = Math.max(outputPath.lastIndexOf("/"), outputPath.lastIndexOf("\\"));
  const name = outputPath.slice(directoryEnd + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? outputPath.slice(0, directoryEnd + 1 + dot) : outputPath;

  return `${stem}.${preset.extension}`;
}
