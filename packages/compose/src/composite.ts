export type LayoutMode = "full-frame" | "speaker-inset" | "side-by-side";

/** A video or image-sequence input. */
export type CompositeSource = {
  input: string;
  /** Frame rate for an image sequence; omitted for a video file. */
  frameRate?: number;
  /** Loop a single still image for the whole duration. */
  loop?: boolean;
};

export type CompositeKey = {
  /** Chroma key colour, as an FFmpeg colour literal. */
  color?: string;
  similarity?: number;
  blend?: number;
};

export type CompositeAudio = {
  musicInput?: string;
  musicVolume?: number;
  /** Integrated loudness target in LUFS. */
  loudnessLufs?: number;
};

export type CompositeCodecs = {
  videoCodec?: string;
  videoArgs?: string[];
  audioCodec?: string;
  audioArgs?: string[];
};

export type CompositeRequest = {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  layout: LayoutMode;
  /** Input index 1. Its audio is the programme audio. */
  speaker: CompositeSource;
  /** Input index 0. */
  slide: CompositeSource;
  key?: CompositeKey;
  audio: CompositeAudio;
  /** Silence the programme audio, for brand bookends. */
  mute?: boolean;
  codecs?: CompositeCodecs;
};

export type CompositeErrorCode = "invalid-request";

/** Error raised when a composite request cannot be built. */
export class CompositeError extends Error {
  readonly code: CompositeErrorCode;

  constructor(code: CompositeErrorCode, message: string) {
    super(message);
    this.name = "CompositeError";
    this.code = code;
  }
}

function sourceArgs(source: CompositeSource): string[] {
  const args: string[] = [];

  if (source.loop === true) {
    args.push("-loop", "1");
  }
  if (source.frameRate !== undefined) {
    args.push("-framerate", String(source.frameRate));
  }

  args.push("-i", source.input);
  return args;
}

function validate(request: CompositeRequest): void {
  if (typeof request.outputPath !== "string" || request.outputPath.trim() === "") {
    throw new CompositeError("invalid-request", "outputPath is required");
  }
  if (!Number.isFinite(request.durationSeconds) || request.durationSeconds <= 0) {
    throw new CompositeError("invalid-request", "durationSeconds must be positive");
  }
  if (!Number.isFinite(request.width) || request.width < 2) {
    throw new CompositeError("invalid-request", "width must be at least 2");
  }
  if (!Number.isFinite(request.height) || request.height < 2) {
    throw new CompositeError("invalid-request", "height must be at least 2");
  }
  if (!Number.isFinite(request.fps) || request.fps <= 0) {
    throw new CompositeError("invalid-request", "fps must be positive");
  }
  if (request.slide.input.trim() === "" || request.speaker.input.trim() === "") {
    throw new CompositeError("invalid-request", "slide and speaker inputs are required");
  }
}

/**
 * Builds the ffmpeg argv for a composite.
 *
 * Inputs are ordered slide (0), speaker (1), music (2). Paths appear only in
 * argv; the filtergraph carries timestamps, labels, and numbers.
 */
export function buildCompositeArgs(request: CompositeRequest): string[] {
  validate(request);

  const { width: W, height: H } = request;
  const duration = request.durationSeconds.toFixed(3);
  const key = request.key ?? {};
  const color = key.color ?? "0x00FF00";
  const similarity = key.similarity ?? 0.1;
  const blend = key.blend ?? 0.1;
  const chroma = `chromakey=color=${color}:similarity=${similarity}:blend=${blend},despill=type=green`;

  const filters: string[] = [];

  switch (request.layout) {
    case "full-frame":
      filters.push(
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1[vout]`,
      );
      break;

    case "speaker-inset": {
      const insetWidth = Math.round(W / 4);
      filters.push(`[1:v]${chroma},scale=${insetWidth}:-1[spk]`);
      filters.push(
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1[base]`,
      );
      filters.push(
        `[base][spk]overlay=x=${W}-overlay_w-40:y=${H}-overlay_h-40:shortest=1[vout]`,
      );
      break;
    }

    case "side-by-side": {
      const half = Math.round(W / 2);
      filters.push(
        `[0:v]scale=${half}:${H}:force_original_aspect_ratio=decrease,pad=${half}:${H}:(ow-iw)/2:(oh-ih)/2[slide]`,
      );
      filters.push(
        `[1:v]${chroma},scale=${half}:${H}:force_original_aspect_ratio=decrease[spk]`,
      );
      filters.push(`color=c=black:s=${half}x${H}:d=${duration}[bg]`);
      filters.push(`[bg][spk]overlay=(W-w)/2:(H-h)/2[spkfull]`);
      filters.push(`[slide][spkfull]hstack=inputs=2[vout]`);
      break;
    }
  }

  const loudness = request.audio.loudnessLufs ?? -16;
  const loudnorm = `loudnorm=I=${loudness}:TP=-1.5:LRA=11`;

  if (request.mute === true) {
    filters.push("anullsrc=r=48000:cl=mono[aout]");
  } else if (request.audio.musicInput === undefined) {
    filters.push(`[1:a]${loudnorm}[aout]`);
  } else {
    const volume = request.audio.musicVolume ?? 0.25;
    filters.push(`[1:a]asplit=2[voice][sidechain]`);
    filters.push(`[2:a]volume=${volume}[bgm]`);
    filters.push(
      `[bgm][sidechain]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=250[ducked]`,
    );
    filters.push(
      `[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0,${loudnorm}[aout]`,
    );
  }

  const codecs = request.codecs ?? {};

  const args = [
    "-y",
    ...sourceArgs(request.slide),
    ...sourceArgs(request.speaker),
    ...(request.audio.musicInput === undefined ? [] : ["-i", request.audio.musicInput]),
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-r",
    String(request.fps),
    "-t",
    duration,
    "-c:v",
    codecs.videoCodec ?? "libx264",
    ...(codecs.videoArgs ?? ["-crf", "20", "-preset", "veryfast"]),
    "-c:a",
    codecs.audioCodec ?? "aac",
    ...(codecs.audioArgs ?? ["-b:a", "192k"]),
    "-ar",
    "48000",
    "-progress",
    "pipe:1",
    "-nostats",
    request.outputPath,
  ];

  return args;
}
