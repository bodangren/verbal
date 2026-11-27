import type { CommandRunner } from "./exec";

export type StreamKind = "video" | "audio" | "subtitle" | "data";

export type MediaStream = {
  index: number;
  kind: StreamKind;
  codec: string | null;
  width?: number;
  height?: number;
  /** Sample aspect ratio (pixel width / pixel height); 1 for square pixels. */
  sampleAspectRatio?: number;
  /** Square-pixel display size after the rotation is applied. */
  displayWidth?: number;
  displayHeight?: number;
  frameRate?: number;
  channels?: number;
  sampleRate?: number;
  rotation?: number;
};

export type MediaInfo = {
  durationSeconds: number | null;
  formatName: string | null;
  sizeBytes: number | null;
  streams: MediaStream[];
};

/** Error raised when ffprobe fails or returns output we cannot interpret. */
export class ProbeError extends Error {
  /** stderr excerpt from ffprobe, when one was available. */
  readonly stderr: string;

  constructor(message: string, stderr = "") {
    super(message);
    this.name = "ProbeError";
    this.stderr = stderr;
  }
}

const PROBE_ARGS = ["-v", "error", "-print_format", "json", "-show_format", "-show_streams"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toKind(value: unknown): StreamKind {
  switch (value) {
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "subtitle":
      return "subtitle";
    default:
      return "data";
  }
}

/** Parses `r_frame_rate`, which ffprobe reports as a fraction such as `30000/1001`. */
function parseFrameRate(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const [numerator, denominator] = value.split("/");
  if (numerator === undefined) {
    return null;
  }

  if (denominator === undefined) {
    const single = Number(numerator);
    return Number.isFinite(single) && single > 0 ? single : null;
  }

  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) {
    return null;
  }

  return n / d;
}

function parseRotation(stream: Record<string, unknown>): number | null {
  const sideData = stream.side_data_list;
  if (Array.isArray(sideData)) {
    for (const entry of sideData) {
      if (isRecord(entry)) {
        const rotation = toNumber(entry.rotation);
        if (rotation !== null) {
          return rotation;
        }
      }
    }
  }

  if (isRecord(stream.tags)) {
    return toNumber(stream.tags.rotate);
  }

  return null;
}

/** True when a rotation swaps width and height (90 or 270 degrees). */
function swapsDimensions(rotation: number): boolean {
  const normalised = ((rotation % 360) + 360) % 360;
  return normalised === 90 || normalised === 270;
}

/** Parses an ffprobe ratio string such as `2:1`; returns null for `0:1` or `N/A`. */
function parseAspectRatio(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "N/A") {
    return null;
  }
  const [numerator, denominator] = trimmed.split(":");
  if (numerator === undefined) {
    return null;
  }
  const n = Number(numerator);
  const d = denominator === undefined ? 1 : Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0) {
    return null;
  }
  return n / d;
}

/** Rounds to the nearest even integer; libx264 needs an even frame size. */
function toEven(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** Reads the sample aspect ratio, falling back to the display aspect ratio. */
function resolveSampleAspectRatio(
  stream: Record<string, unknown>,
  width: number,
  height: number,
): number {
  const direct = parseAspectRatio(stream.sample_aspect_ratio);
  if (direct !== null) {
    return direct;
  }
  const display = parseAspectRatio(stream.display_aspect_ratio);
  if (display !== null && width > 0) {
    return (display * height) / width;
  }
  return 1;
}

function parseStream(value: unknown): MediaStream {
  if (!isRecord(value)) {
    throw new ProbeError("ffprobe stream entry is not an object");
  }

  const stream: MediaStream = {
    index: typeof value.index === "number" ? value.index : -1,
    kind: toKind(value.codec_type),
    codec: typeof value.codec_name === "string" ? value.codec_name : null,
  };

  if (stream.kind === "video") {
    if (typeof value.width === "number") {
      stream.width = value.width;
    }
    if (typeof value.height === "number") {
      stream.height = value.height;
    }
    const frameRate = parseFrameRate(value.r_frame_rate);
    if (frameRate !== null) {
      stream.frameRate = frameRate;
    }
    const rotation = parseRotation(value);
    if (rotation !== null) {
      stream.rotation = rotation;
    }
    if (stream.width !== undefined && stream.height !== undefined) {
      stream.sampleAspectRatio = resolveSampleAspectRatio(value, stream.width, stream.height);
      const squareWidth = toEven(Math.round(stream.width * stream.sampleAspectRatio));
      if (rotation !== null && swapsDimensions(rotation)) {
        stream.displayWidth = stream.height;
        stream.displayHeight = squareWidth;
      } else {
        stream.displayWidth = squareWidth;
        stream.displayHeight = stream.height;
      }
    }
  }

  if (stream.kind === "audio") {
    if (typeof value.channels === "number") {
      stream.channels = value.channels;
    }
    const sampleRate = toNumber(value.sample_rate);
    if (sampleRate !== null) {
      stream.sampleRate = sampleRate;
    }
  }

  return stream;
}

/** Turns `ffprobe -print_format json` output into a typed description. */
export function parseProbeOutput(raw: string): MediaInfo {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new ProbeError("ffprobe returned invalid JSON");
  }

  if (!isRecord(value)) {
    throw new ProbeError("ffprobe output must be a JSON object");
  }

  const streams = Array.isArray(value.streams) ? value.streams.map(parseStream) : [];
  const format = isRecord(value.format) ? value.format : {};

  return {
    durationSeconds: toNumber(format.duration),
    formatName: typeof format.format_name === "string" ? format.format_name : null,
    sizeBytes: toNumber(format.size),
    streams,
  };
}

function extractStderr(error: unknown): string {
  if (typeof error === "object" && error !== null && "stderr" in error) {
    const value = (error as { stderr?: unknown }).stderr;
    if (typeof value === "string") {
      return value.trim();
    }
  }
  return "";
}

/** Probes a media file with ffprobe, surfacing its stderr when it fails. */
export async function probeMedia(runner: CommandRunner, file: string): Promise<MediaInfo> {
  let stdout: string;

  try {
    ({ stdout } = await runner("ffprobe", [...PROBE_ARGS, file]));
  } catch (error) {
    const stderr = extractStderr(error);
    throw new ProbeError(`ffprobe failed for ${file}${stderr ? `: ${stderr}` : ""}`, stderr);
  }

  return parseProbeOutput(stdout);
}
