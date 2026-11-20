export type CaptureSize = {
  width: number;
  height: number;
};

export type CaptureCodecs = {
  videoCodec?: string;
  videoArgs?: string[];
  audioCodec?: string;
  audioArgs?: string[];
};

export type CaptureRequest = {
  outputPath: string;
  durationSeconds: number;
  /** V4L2 device, default `/dev/video0`. */
  videoDevice?: string;
  /** PulseAudio source, default `default`. */
  audioDevice?: string;
  fps?: number;
  size?: CaptureSize;
  codecs?: CaptureCodecs;
};

export type CaptureErrorCode = "invalid-capture";

/** Error raised when a capture request cannot be built. */
export class CaptureError extends Error {
  readonly code: CaptureErrorCode = "invalid-capture";

  constructor(message: string) {
    super(message);
    this.name = "CaptureError";
  }
}

/**
 * Builds the ffmpeg argv for a green-screen recording.
 *
 * The source is written un-keyed: keying happens at composite time so the
 * recording can be re-keyed with different settings.
 */
export function buildCaptureArgs(request: CaptureRequest): string[] {
  if (typeof request.outputPath !== "string" || request.outputPath.trim() === "") {
    throw new CaptureError("outputPath is required");
  }
  if (
    !Number.isFinite(request.durationSeconds) ||
    request.durationSeconds <= 0 ||
    request.durationSeconds > 3600
  ) {
    throw new CaptureError("durationSeconds must be between 0 and 3600");
  }

  const video: string[] = ["-f", "v4l2"];

  if (request.size !== undefined) {
    if (
      !Number.isFinite(request.size.width) ||
      !Number.isFinite(request.size.height) ||
      request.size.width < 2 ||
      request.size.height < 2
    ) {
      throw new CaptureError("size must be at least 2x2");
    }
    video.push("-video_size", `${request.size.width}x${request.size.height}`);
  }

  if (request.fps !== undefined) {
    if (!Number.isFinite(request.fps) || request.fps <= 0) {
      throw new CaptureError("fps must be positive");
    }
    video.push("-framerate", String(request.fps));
  }

  video.push("-i", request.videoDevice ?? "/dev/video0");

  const audio = ["-f", "pulse", "-i", request.audioDevice ?? "default"];

  const codecs = request.codecs ?? {};

  return [
    "-y",
    ...video,
    ...audio,
    "-t",
    request.durationSeconds.toFixed(3),
    "-c:v",
    codecs.videoCodec ?? "libx264",
    ...(codecs.videoArgs ?? ["-preset", "veryfast", "-crf", "20"]),
    "-c:a",
    codecs.audioCodec ?? "aac",
    ...(codecs.audioArgs ?? ["-b:a", "192k"]),
    "-progress",
    "pipe:1",
    "-nostats",
    request.outputPath,
  ];
}
