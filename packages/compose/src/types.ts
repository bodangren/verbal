/** Everything needed to render one storyboard scene to frames. */
export type SlideRenderRequest = {
  sceneId: string;
  template: string;
  props: Record<string, unknown>;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
};

/** What a renderer produced. Frames live in the output directory. */
export type SlideManifest = {
  frames: number;
  fps: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  /** printf-style frame pattern, e.g. `frame-%04d.png`. */
  pattern: string;
};

export type SlideRenderOptions = {
  outputDirectory: string;
  signal?: AbortSignal;
};

/** A renderer turns a scene contract into an alpha-preserving PNG sequence. */
export interface SlideRenderer {
  render(request: SlideRenderRequest, options: SlideRenderOptions): Promise<SlideManifest>;
}

export type SlideErrorCode = "cancelled" | "timeout" | "render-failed" | "invalid-manifest";

/** Error raised by a slide renderer. */
export class SlideError extends Error {
  readonly code: SlideErrorCode;

  constructor(code: SlideErrorCode, message: string) {
    super(message);
    this.name = "SlideError";
    this.code = code;
  }
}
