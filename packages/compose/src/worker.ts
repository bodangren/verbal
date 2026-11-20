import {
  SlideError,
  type SlideManifest,
  type SlideRenderOptions,
  type SlideRenderRequest,
  type SlideRenderer,
} from "./types";

/** Runs a process with JSON on stdin and captures stdout/stderr. */
export type ProcessRunner = (
  file: string,
  args: readonly string[],
  options: { input: string; signal?: AbortSignal },
) => Promise<{ stdout: string; stderr: string }>;

export type ProcessRendererConfig = {
  command: string;
  args?: string[];
  run: ProcessRunner;
  timeoutMs?: number;
};

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseManifest(raw: string): SlideManifest {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new SlideError("invalid-manifest", "renderer returned invalid JSON");
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SlideError("invalid-manifest", "renderer returned a non-object manifest");
  }

  const record = value as Record<string, unknown>;
  const frames = numberField(record.frames);
  const fps = numberField(record.fps);
  const width = numberField(record.width);
  const height = numberField(record.height);
  const pattern = record.pattern;

  if (frames === null || frames < 1) {
    throw new SlideError("invalid-manifest", "manifest has no frames");
  }
  if (fps === null || fps <= 0) {
    throw new SlideError("invalid-manifest", "manifest has an invalid frame rate");
  }
  if (width === null || width < 1 || height === null || height < 1) {
    throw new SlideError("invalid-manifest", "manifest has invalid dimensions");
  }
  if (typeof pattern !== "string" || pattern === "") {
    throw new SlideError("invalid-manifest", "manifest has no frame pattern");
  }

  return { frames, fps, width, height, hasAlpha: record.hasAlpha === true, pattern };
}

/**
 * Renderer backed by a child process.
 *
 * The process receives the request as JSON and must print the manifest as
 * JSON. Timeouts and the caller's abort signal both cancel it.
 */
export function createProcessRenderer(config: ProcessRendererConfig): SlideRenderer {
  const timeoutMs = config.timeoutMs ?? 120_000;

  return {
    async render(
      request: SlideRenderRequest,
      options: SlideRenderOptions,
    ): Promise<SlideManifest> {
      const controller = new AbortController();
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      const onAbort = () => {
        controller.abort();
      };

      if (options.signal?.aborted === true) {
        controller.abort();
      } else {
        options.signal?.addEventListener("abort", onAbort, { once: true });
      }

      try {
        const { stdout } = await config.run(config.command, config.args ?? [], {
          input: JSON.stringify({ ...request, outputDirectory: options.outputDirectory }),
          signal: controller.signal,
        });

        return parseManifest(stdout);
      } catch (error) {
        if (timedOut) {
          throw new SlideError("timeout", `slide render timed out after ${timeoutMs}ms`);
        }
        if (options.signal?.aborted === true) {
          throw new SlideError("cancelled", "slide render cancelled");
        }
        if (error instanceof SlideError) {
          throw error;
        }
        throw new SlideError(
          "render-failed",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
