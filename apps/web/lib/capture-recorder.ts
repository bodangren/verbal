export type MediaRecorderLike = {
  state: "inactive" | "recording" | "paused";
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};

export type CreateRecorder = (stream: MediaStream, mimeType: string) => MediaRecorderLike;

/** Preferred recording formats, best first. */
export const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  return MIME_CANDIDATES.find((type) => isSupported(type)) ?? null;
}

/**
 * Wraps MediaRecorder so the page owns one recorder and one stop promise.
 *
 * The browser decides the container; the upload is normalized to MP4 on the
 * server, so the app never depends on a single browser codec.
 */
export class CaptureRecorder {
  private chunks: BlobPart[] = [];
  private recorder: MediaRecorderLike | null = null;
  private mimeType: string | null = null;
  private stopPromise: Promise<Blob> | null = null;
  private resolveStop: ((blob: Blob) => void) | null = null;

  get active(): boolean {
    return this.recorder?.state === "recording";
  }

  get type(): string | null {
    return this.mimeType;
  }

  start(
    stream: MediaStream,
    create: CreateRecorder,
    isSupported: (type: string) => boolean,
  ): string {
    if (this.recorder !== null) {
      throw new Error("recording already started");
    }

    const mimeType = pickMimeType(isSupported);
    if (mimeType === null) {
      throw new Error("no supported recording format");
    }

    const recorder = create(stream, mimeType);
    this.chunks = [];
    this.mimeType = mimeType;
    this.recorder = recorder;
    this.stopPromise = null;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mimeType });
      this.recorder = null;
      this.resolveStop?.(blob);
      this.resolveStop = null;
    };

    recorder.start(1000);
    return mimeType;
  }

  stop(): Promise<Blob> {
    if (this.recorder === null) {
      return Promise.resolve(new Blob([], { type: this.mimeType ?? "video/webm" }));
    }
    if (this.stopPromise !== null) {
      return this.stopPromise;
    }

    this.stopPromise = new Promise((resolve) => {
      this.resolveStop = resolve;
    });
    this.recorder.stop();
    return this.stopPromise;
  }
}
