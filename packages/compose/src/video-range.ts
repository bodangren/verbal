export type VideoRangeRequest = {
  /** Source media file. */
  input: string;
  /** Seconds into the source where the scene starts. */
  startSeconds: number;
  durationSeconds: number;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  videoCodec?: string;
  audioCodec?: string;
  videoArgs?: string[];
  audioArgs?: string[];
  /** False when the source has no audio stream; the cut then gets silent audio. */
  hasAudio?: boolean;
};

export type VideoRangeErrorCode = "invalid-range";

/** Error raised when a source range cannot be turned into a segment. */
export class VideoRangeError extends Error {
  readonly code: VideoRangeErrorCode;

  constructor(message: string) {
    super(message);
    this.name = "VideoRangeError";
    this.code = "invalid-range";
  }
}

/**
 * Builds the argv that cuts one source-video range into a scene segment.
 *
 * Talk scenes are the source video itself, so they must be re-encoded to the
 * export geometry and codecs before they can be concatenated with rendered
 * slides. `-ss` seeks the input; `-t` bounds the output.
 */
export function buildVideoRangeArgs(request: VideoRangeRequest): string[] {
  if (request.input.trim() === "" || request.outputPath.trim() === "") {
    throw new VideoRangeError("input and outputPath are required");
  }
  if (!Number.isFinite(request.startSeconds) || request.startSeconds < 0) {
    throw new VideoRangeError("startSeconds must be zero or positive");
  }
  if (!Number.isFinite(request.durationSeconds) || request.durationSeconds <= 0) {
    throw new VideoRangeError("durationSeconds must be positive");
  }
  if (!Number.isFinite(request.width) || request.width < 2) {
    throw new VideoRangeError("width must be at least 2");
  }
  if (!Number.isFinite(request.height) || request.height < 2) {
    throw new VideoRangeError("height must be at least 2");
  }
  if (!Number.isFinite(request.fps) || request.fps <= 0) {
    throw new VideoRangeError("fps must be positive");
  }

  const { width: W, height: H } = request;
  const silentAudio = request.hasAudio === false;

  return [
    "-y",
    "-ss",
    request.startSeconds.toFixed(3),
    "-i",
    request.input,
    ...(silentAudio ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"] : []),
    "-t",
    request.durationSeconds.toFixed(3),
    ...(silentAudio ? ["-map", "0:v:0", "-map", "1:a:0"] : []),
    "-vf",
    `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    "-r",
    String(request.fps),
    "-c:v",
    request.videoCodec ?? "libx264",
    ...(request.videoArgs ?? ["-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p"]),
    "-c:a",
    request.audioCodec ?? "aac",
    ...(request.audioArgs ?? ["-b:a", "192k"]),
    "-ar",
    "48000",
    "-progress",
    "pipe:1",
    "-nostats",
    request.outputPath,
  ];
}

export type SilenceRequest = {
  durationSeconds: number;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  videoCodec?: string;
  audioCodec?: string;
  videoArgs?: string[];
  audioArgs?: string[];
};

/**
 * Builds the argv for one silent, black segment.
 *
 * The sources come from lavfi, so no source media or slide renderer is needed.
 * Codecs and size match the video-range segments so concat can join them.
 */
export function buildSilenceArgs(request: SilenceRequest): string[] {
  if (!Number.isFinite(request.durationSeconds) || request.durationSeconds <= 0) {
    throw new VideoRangeError("durationSeconds must be positive");
  }
  if (request.outputPath.trim() === "") {
    throw new VideoRangeError("outputPath is required");
  }
  if (!Number.isFinite(request.width) || request.width < 2) {
    throw new VideoRangeError("width must be at least 2");
  }
  if (!Number.isFinite(request.height) || request.height < 2) {
    throw new VideoRangeError("height must be at least 2");
  }
  if (!Number.isFinite(request.fps) || request.fps <= 0) {
    throw new VideoRangeError("fps must be positive");
  }

  const duration = request.durationSeconds.toFixed(3);
  const { width: W, height: H } = request;

  return [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${W}x${H}:r=${request.fps}:d=${duration}`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=mono",
    "-t",
    duration,
    "-vf",
    "setsar=1",
    "-r",
    String(request.fps),
    "-c:v",
    request.videoCodec ?? "libx264",
    ...(request.videoArgs ?? ["-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p"]),
    "-c:a",
    request.audioCodec ?? "aac",
    ...(request.audioArgs ?? ["-b:a", "192k"]),
    "-ar",
    "48000",
    "-shortest",
    "-progress",
    "pipe:1",
    "-nostats",
    request.outputPath,
  ];
}
