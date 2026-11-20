import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../../server/api-errors";
import { methodNotAllowed, sendJson } from "../../../server/http";
import { createWaveformApi } from "../../../server/waveform-api";
import { requireAbsolutePath } from "../../../server/validation";

function numberParam(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response, "GET");
    return;
  }

  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const root = requireAbsolutePath(url.searchParams.get("root"), "root");

    const image = await createWaveformApi().image({
      root,
      options: {
        width: numberParam(url.searchParams.get("width")) ?? 1200,
        height: numberParam(url.searchParams.get("height")) ?? 120,
      },
    });

    response.statusCode = 200;
    response.setHeader("Content-Type", "image/png");
    // The cache key already covers the source revision; a stale HTTP cache would
    // outlive a re-import.
    response.setHeader("Cache-Control", "no-store");
    response.end(image.bytes);
  } catch (error) {
    sendJson(response, failure(error));
  }
}
